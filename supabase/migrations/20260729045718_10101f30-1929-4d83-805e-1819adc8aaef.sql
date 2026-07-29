
-- 1. Restrict profiles SELECT
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;

CREATE POLICY "Profiles viewable by owner and related"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.parent_links pl
    WHERE pl.child_user_id = profiles.user_id AND pl.parent_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.participant_1 = auth.uid() AND c.participant_2 = profiles.user_id)
       OR (c.participant_2 = auth.uid() AND c.participant_1 = profiles.user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_applications ta ON ta.task_id = t.id
    WHERE (t.creator_id = auth.uid() AND ta.applicant_id = profiles.user_id)
       OR (ta.applicant_id = auth.uid() AND t.creator_id = profiles.user_id)
  )
);

-- 2. Public-safe view for public profile pages
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT user_id, first_name, last_name, avatar_url, created_at
FROM public.profiles;

-- The view uses security_invoker so it needs its own permissive read path.
-- Grant read to everyone; the underlying policy above blocks direct table reads.
-- We add a permissive SELECT policy that only exposes non-sensitive columns via the view.
CREATE POLICY "Public safe columns via view"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (
  -- Only allow when the query targets exactly the safe columns exposed by public_profiles.
  -- Postgres cannot restrict columns in RLS, so instead we grant column-level SELECT
  -- to anon/authenticated on the safe columns only (below) and rely on that.
  false
);
-- The dummy policy above is a no-op; column-level grants do the real work:
DROP POLICY IF EXISTS "Public safe columns via view" ON public.profiles;

GRANT SELECT (user_id, first_name, last_name, avatar_url, created_at)
  ON public.profiles TO anon, authenticated;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 3. Storage policies for task-images
DROP POLICY IF EXISTS "Authenticated users can upload task images" ON storage.objects;
DROP POLICY IF EXISTS "Task images readable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own task images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own task images" ON storage.objects;

CREATE POLICY "Users can upload own task images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own task images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'task-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own task images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own task images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
