-- The public profile screen was writing "חבר/ה מאז" because get_public_profile
-- did not return the one column that would let it choose. Gender is already a
-- presentation detail everywhere else in the app (it decides how notifications
-- address a person), and the privacy policy lists it as collected for exactly
-- that purpose, so it joins the public-safe column set here.
DROP FUNCTION IF EXISTS public.get_public_profile(uuid);

CREATE FUNCTION public.get_public_profile(_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  gender public.gender,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.first_name, p.last_name, p.avatar_url, p.gender, p.created_at
  FROM public.profiles p
  WHERE p.user_id = _user_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO anon, authenticated;
