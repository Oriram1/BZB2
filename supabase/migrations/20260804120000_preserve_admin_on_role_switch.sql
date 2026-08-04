-- switch_my_role deleted every row for the caller before inserting the new
-- functional role. Since 20260803120000 an account may hold 'admin' alongside a
-- functional role, so that DELETE silently stripped admin from any admin who
-- switched between tasker/bee/parent — and admin is not self-assignable, so the
-- account could not get it back without a server-side grant.
--
-- Only functional roles are exchanged here. 'admin' is a separate permission and
-- must survive the switch untouched.
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

  DELETE FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role <> 'admin'::public.app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), target_role);

  RETURN target_role;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_my_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_my_role(public.app_role) TO authenticated;
