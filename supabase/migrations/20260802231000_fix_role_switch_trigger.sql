-- The database role is canonical. Do not compare it to a stale JWT metadata claim:
-- role switching updates auth.users in the same transaction, while auth.jwt()
-- still represents the token that initiated the request.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'one_role_per_user';
  END IF;

  RETURN NEW;
END;
$$;
