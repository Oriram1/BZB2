
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = false)
AS
SELECT user_id, first_name, last_name, avatar_url, created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Revoke column-level grants we added earlier; the view is the only public path now.
REVOKE SELECT (user_id, first_name, last_name, avatar_url, created_at)
  ON public.profiles FROM anon, authenticated;
