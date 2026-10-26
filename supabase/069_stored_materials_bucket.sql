-- Run in Supabase Dashboard SQL Editor after 068_stored_materials.sql
--
-- Private bucket for stored-materials documents. Unlike pay-app-pdfs /
-- co-documents (public, user-scoped), this one is PRIVATE — files are only
-- reachable through signed URLs / authenticated downloads.
--
-- Path shape written by the app: "{organization_id | user_id}/{job_id}/{uuid}-{filename}"
--   * first folder = the org id  -> any org member can read, owner / project
--     manager / project accountant can write
--   * first folder = the user id -> zero-regression fallback for a user with
--     no organization yet (same idea as 047)
-- Limits are enforced by the bucket: 10 MB per file, PDF/JPG/PNG only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stored-materials',
  'stored-materials',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "stored_materials_files_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'stored-materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_org_member(((storage.foldername(name))[1])::uuid)
    )
  );

create policy "stored_materials_files_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'stored-materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_org_write_access(((storage.foldername(name))[1])::uuid)
    )
  );

-- Needed because the app uploads with upsert-safe unique names but a user may
-- retry a failed upload; no DELETE policy — files are never removed from the UI.
create policy "stored_materials_files_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'stored-materials'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_org_write_access(((storage.foldername(name))[1])::uuid)
    )
  );

-- Verification — paste back the result. Expect one row, public = false.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'stored-materials';
