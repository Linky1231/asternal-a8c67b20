
CREATE POLICY "post-media read all" ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');
CREATE POLICY "post-media upload own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "post-media delete own or mod" ON storage.objects FOR DELETE
  USING (bucket_id = 'post-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_mod_or_admin(auth.uid())));
