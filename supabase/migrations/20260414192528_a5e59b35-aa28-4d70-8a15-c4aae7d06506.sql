INSERT INTO storage.buckets (id, name, public)
VALUES ('task-images', 'task-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload task images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-images');

CREATE POLICY "Public can view task images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'task-images');

CREATE POLICY "Users can delete own task images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-images' AND (storage.foldername(name))[1] = auth.uid()::text);