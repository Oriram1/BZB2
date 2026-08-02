-- Keep exactly one active application role per account.
-- Switching is explicit and transactional; adding a second role is never allowed.
CREATE OR REPLACE FUNCTION public.switch_my_role(target_role public.app_role)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL OR target_role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'role_switch_not_allowed';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{app_role}',
    to_jsonb(target_role::text),
    true
  )
  WHERE id = auth.uid();

  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), target_role);

  RETURN target_role;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_my_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_my_role(public.app_role) TO authenticated;
