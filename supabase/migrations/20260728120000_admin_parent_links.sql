-- These three policies are also created by 20260728075144, which lands first, so
-- replaying the chain on a fresh database failed here on 42710. The drops make
-- this file idempotent without changing the end state — 20260728201823 recreates
-- the SELECT policy afterwards either way.
DROP POLICY IF EXISTS "Admins can view all parent links" ON public.parent_links;
CREATE POLICY "Admins can view all parent links"
ON public.parent_links
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can create parent links" ON public.parent_links;
CREATE POLICY "Admins can create parent links"
ON public.parent_links
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete parent links" ON public.parent_links;
CREATE POLICY "Admins can delete parent links"
ON public.parent_links
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));
