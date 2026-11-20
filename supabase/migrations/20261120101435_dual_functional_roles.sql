-- The declared birth date is private and can be set once by its owner.
CREATE TABLE private.user_birth_dates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_date date NOT NULL
);
ALTER TABLE private.user_birth_dates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.user_birth_dates FROM PUBLIC, anon, authenticated;

-- Snapshot a birth date supplied at sign-up; later metadata edits are ignored.
CREATE OR REPLACE FUNCTION private.capture_signup_birth_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE supplied date;
BEGIN
  IF NEW.raw_user_meta_data->>'birth_date' IS NULL THEN RETURN NEW; END IF;
  supplied := (NEW.raw_user_meta_data->>'birth_date')::date;
  IF date_part('year', age((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')::date, supplied)) NOT BETWEEN 13 AND 120 THEN
    RAISE EXCEPTION 'birth_date_invalid';
  END IF;
  INSERT INTO private.user_birth_dates(user_id, birth_date) VALUES (NEW.id, supplied);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_signup_birth_date() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_signup_birth_date AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.capture_signup_birth_date();

CREATE OR REPLACE FUNCTION public.set_my_birth_date(_birth_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _birth_date IS NULL OR date_part('year', age((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')::date, _birth_date)) NOT BETWEEN 13 AND 120 THEN
    RAISE EXCEPTION 'birth_date_invalid';
  END IF;
  INSERT INTO private.user_birth_dates(user_id, birth_date)
  VALUES(auth.uid(), _birth_date) ON CONFLICT (user_id) DO NOTHING;
  SELECT birth_date INTO existing FROM private.user_birth_dates WHERE user_id = auth.uid();
  IF existing IS DISTINCT FROM _birth_date THEN RAISE EXCEPTION 'birth_date_already_set'; END IF;
  UPDATE public.profiles SET age = date_part('year', age((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')::date, existing))::integer
  WHERE user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_birth_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birth_date(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 8421));
  IF NEW.role = 'admin' THEN
    IF auth.uid() IS NOT NULL AND NOT private.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'admin_role_not_self_assignable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.role = 'parent' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role <> 'admin')
     OR NEW.role <> 'parent' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'parent') THEN
    RAISE EXCEPTION 'one_role_per_user';
  END IF;
  IF NEW.role = 'tasker' AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM private.user_birth_dates WHERE user_id = NEW.user_id AND birth_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')::date - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'publisher_age_restricted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE private.user_active_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_role public.app_role NOT NULL CHECK (active_role IN ('bee', 'tasker'))
);
ALTER TABLE private.user_active_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.user_active_roles FROM PUBLIC, anon, authenticated;

-- Complete email signup even when email verification delays the first session.
-- Temporary signup details are removed from auth metadata within this transaction.
CREATE OR REPLACE FUNCTION private.complete_email_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  details jsonb := NEW.raw_user_meta_data->'signup_details';
  requested text := NEW.raw_user_meta_data->>'app_role';
  dob date;
  years integer;
  wants_publisher boolean;
BEGIN
  IF details IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(details) <> 'object' OR requested NOT IN ('bee', 'tasker') THEN
    RAISE EXCEPTION 'signup_details_invalid';
  END IF;
  SELECT birth_date INTO dob FROM private.user_birth_dates WHERE user_id = NEW.id;
  IF dob IS NULL THEN RAISE EXCEPTION 'birth_date_invalid'; END IF;
  years := date_part('year', age((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')::date, dob))::integer;
  wants_publisher := COALESCE((details->>'also_publisher')::boolean, false);
  IF (requested = 'tasker' OR wants_publisher) AND years < 18 THEN RAISE EXCEPTION 'publisher_age_restricted'; END IF;
  UPDATE public.profiles SET
    age = years,
    address = NULLIF(details->>'address', ''),
    phone = NULLIF(details->>'phone', ''),
    latitude = NULLIF(details->>'latitude', '')::double precision,
    longitude = NULLIF(details->>'longitude', '')::double precision,
    gender = (details->>'gender')::public.gender,
    marketing_consent = COALESCE((details->>'marketing_consent')::boolean, false)
  WHERE user_id = NEW.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'signup_profile_missing'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES(NEW.id, requested::public.app_role);
  IF requested = 'bee' AND wants_publisher THEN
    INSERT INTO public.user_roles(user_id, role) VALUES(NEW.id, 'tasker');
  END IF;
  INSERT INTO private.user_active_roles(user_id, active_role) VALUES(NEW.id, requested::public.app_role);
  UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data - 'signup_details' - 'birth_date' WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.complete_email_signup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER z_complete_email_signup AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.complete_email_signup();

CREATE OR REPLACE FUNCTION public.switch_my_role(target_role public.app_role)
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR target_role NOT IN ('tasker'::public.app_role, 'bee'::public.app_role) THEN
    RAISE EXCEPTION 'role_switch_not_allowed';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 8421));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = target_role) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), target_role);
  END IF;
  INSERT INTO private.user_active_roles(user_id, active_role) VALUES(auth.uid(), target_role)
  ON CONFLICT (user_id) DO UPDATE SET active_role = EXCLUDED.active_role;
  RETURN target_role;
END;
$$;
REVOKE ALL ON FUNCTION public.switch_my_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_my_role(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_active_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT active_role FROM private.user_active_roles
  WHERE user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = active_role
  );
$$;
REVOKE ALL ON FUNCTION public.get_my_active_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_active_role() TO authenticated;
