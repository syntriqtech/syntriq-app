-- Attach uploaded contract PDF to a job record
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS contract_pdf_url text;

-- Storage bucket for contract PDFs (source documents uploaded during job setup).
-- Public bucket: paths are {user_id}/{uuid}.pdf — not guessable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-pdfs', 'contract-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only read/write files under their own user-id prefix.
CREATE POLICY "Users manage their own contract PDFs"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'contract-pdfs' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'contract-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
