-- A child can no longer remove a parent contact. Only the parent, through the
-- parent-remove function (service_role, share token checked first), can.
DROP POLICY IF EXISTS "Children remove own parent contacts" ON public.parent_contacts;
REVOKE DELETE ON public.parent_contacts FROM authenticated;
