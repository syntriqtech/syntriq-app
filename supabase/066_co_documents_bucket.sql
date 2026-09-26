-- Run in Supabase Dashboard SQL Editor after 065_billing_form_templates_library.sql
--
-- The "co-documents" bucket was called out as a manual setup step in
-- 008_change_orders.sql but never actually got created, so Import Change
-- Order (AI) and per-CO approval doc uploads (uploadCoDocument in
-- changeOrdersDb.ts) have been failing with "Bucket not found" / RLS errors.
-- This creates it the same way the other source-document buckets are set up
-- (contract-pdfs, pay-app-pdfs): public, with paths scoped under each user's
-- own id so an RLS policy can restrict access per-user.

INSERT INTO storage.buckets (id, name, public)
VALUES ('co-documents', 'co-documents', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only read/write files under their own user-id prefix.
-- Covers both path shapes the app writes: "{user_id}/import/{uuid}.ext"
-- (AI import) and "{user_id}/{co_id}/{timestamp}.ext" (approval doc upload).
CREATE POLICY "Users manage their own CO documents"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'co-documents' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'co-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
