-- Authorization invariants: role data in the database is authoritative.
-- Client metadata may help during signup, but cannot grant a second role or
-- change an existing role after the account has been created.

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count integer;
  requested_role text;
BEGIN
  SELECT count(*) INTO existing_count
  FROM public.user_roles
  WHERE user_id = NEW.user_id;

  IF existing_count > 0 THEN
    RAISE EXCEPTION 'one_role_per_user';
  END IF;

  requested_role := auth.jwt() -> 'user_metadata' ->> 'app_role';
  IF requested_role IS NULL OR requested_role <> NEW.role::text THEN
    RAISE EXCEPTION 'role_must_match_signup_metadata';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_invariants ON public.user_roles;
CREATE TRIGGER enforce_role_invariants
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

DROP POLICY IF EXISTS "Roles viewable by everyone" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles or admins view all" ON public.user_roles;

CREATE POLICY "Users can view own roles or admins view all"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create only their initial role"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
