-- Attach uploaded company logo to the company profile record
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Storage bucket for company logos (one per user, public bucket)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only read/write files under their own user-id prefix
CREATE POLICY "Users manage their own company logos"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'company-logos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'company-logos' AND auth.uid()::text = (storage.foldername(name))[1]);
