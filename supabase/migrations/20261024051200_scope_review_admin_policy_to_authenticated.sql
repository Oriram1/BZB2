-- Anonymous readers cannot call private.has_role. Do not evaluate the admin
-- policy for them; approved reviews remain public through their SELECT policy.
ALTER POLICY "admins can read all reviews" ON public.reviews TO authenticated;
