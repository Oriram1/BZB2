-- Google OAuth sends full_name / name, not first_name / last_name.
-- Fall back through the variants so both email+password and Google signups
-- populate the profile name correctly.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first text;
  _last  text;
  _dname text;
BEGIN
  _first := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
  _last  := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'last_name', '')), '');

  -- Google puts the display name under "full_name" or "name".
  IF _first IS NULL AND _last IS NULL THEN
    _dname := NULLIF(TRIM(COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    )), '');
    IF _dname IS NOT NULL THEN
      _first := SPLIT_PART(_dname, ' ', 1);
      _last  := NULLIF(TRIM(SUBSTR(_dname, LENGTH(_first) + 2)), '');
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, first_name, last_name)
  VALUES (NEW.id, COALESCE(_first, ''), COALESCE(_last, ''));
  RETURN NEW;
END;
$$;

-- Backfill existing profiles that have an empty name but auth metadata has one.
UPDATE public.profiles p
SET
  first_name = SPLIT_PART(u.dname, ' ', 1),
  last_name  = COALESCE(NULLIF(TRIM(SUBSTR(u.dname, LENGTH(SPLIT_PART(u.dname, ' ', 1)) + 2)), ''), '')
FROM (
  SELECT
    id AS uid,
    NULLIF(TRIM(COALESCE(
      raw_user_meta_data->>'first_name',
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      ''
    )), '') AS dname
  FROM auth.users
) u
WHERE p.user_id = u.uid
  AND TRIM(COALESCE(p.first_name, '')) = ''
  AND u.dname IS NOT NULL;
