
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Roles viewable by everyone" ON public.user_roles;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all parent links" ON public.parent_links;
CREATE POLICY "Admins can view all parent links"
  ON public.parent_links FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can create parent links" ON public.parent_links;
CREATE POLICY "Admins can create parent links"
  ON public.parent_links FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete parent links" ON public.parent_links;
CREATE POLICY "Admins can delete parent links"
  ON public.parent_links FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles or admins view all"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars readable by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public can view task images" ON storage.objects;
CREATE POLICY "Task images readable by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'task-images');
