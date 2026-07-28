CREATE POLICY "Admins can view all parent links"
ON public.parent_links
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create parent links"
ON public.parent_links
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete parent links"
ON public.parent_links
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));
