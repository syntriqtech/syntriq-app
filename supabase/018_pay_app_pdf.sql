-- Add PDF storage URL to pay applications
ALTER TABLE pay_applications
  ADD COLUMN IF NOT EXISTS pdf_url text;

-- Storage bucket for signed pay application PDFs.
-- Public bucket: paths include {user_id}/{pay_app_id}.pdf (UUID-based, not guessable).
INSERT INTO storage.buckets (id, name, public)
VALUES ('pay-app-pdfs', 'pay-app-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only read/write files under their own user-id prefix.
CREATE POLICY "Users manage their own pay app PDFs"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'pay-app-pdfs' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'pay-app-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
