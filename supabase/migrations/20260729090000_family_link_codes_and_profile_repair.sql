-- Repair legacy profiles from auth metadata without overwriting names users edited.
UPDATE public.profiles AS profile
SET
  first_name = CASE
    WHEN btrim(profile.first_name) = ''
      THEN COALESCE(NULLIF(btrim(auth_user.raw_user_meta_data->>'first_name'), ''), '')
    ELSE profile.first_name
  END,
  last_name = CASE
    WHEN btrim(profile.last_name) = ''
      THEN COALESCE(NULLIF(btrim(auth_user.raw_user_meta_data->>'last_name'), ''), '')
    ELSE profile.last_name
  END
FROM auth.users AS auth_user
WHERE auth_user.id = profile.user_id
  AND (
    btrim(profile.first_name) = ''
    OR btrim(profile.last_name) = ''
  );

-- Parent-child links may now be created only by the one-time-code flow or an admin.
DROP POLICY IF EXISTS "Parents can create links" ON public.parent_links;

-- 20260729052743 creates these same two tables, so a fresh replay hit 42P07 here.
-- Written idempotently: the end state is identical either way.
CREATE TABLE IF NOT EXISTS public.family_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_link_codes_child_active_idx
  ON public.family_link_codes (child_user_id, expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE public.family_link_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.family_link_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.family_link_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.family_link_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS family_link_attempts_parent_time_idx
  ON public.family_link_attempts (parent_user_id, attempted_at DESC);

ALTER TABLE public.family_link_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.family_link_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.family_link_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_family_link_code(
  _parent_user_id uuid,
  _code_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  linked_child_id uuid;
BEGIN
  UPDATE public.family_link_codes
  SET used_at = now()
  WHERE code_hash = _code_hash
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING child_user_id INTO linked_child_id;

  IF linked_child_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF linked_child_id = _parent_user_id THEN
    RAISE EXCEPTION 'self_link_not_allowed';
  END IF;

  INSERT INTO public.parent_links (parent_user_id, child_user_id)
  VALUES (_parent_user_id, linked_child_id)
  ON CONFLICT (parent_user_id, child_user_id) DO NOTHING;

  RETURN linked_child_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_family_link_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_family_link_code(uuid, text) TO service_role;
