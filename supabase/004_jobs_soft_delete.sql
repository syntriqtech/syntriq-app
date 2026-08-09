-- Run this in the Supabase Dashboard SQL Editor.
-- Adds a soft-delete column to jobs so deleted jobs can be recovered.
-- A null deleted_at means the job is active; a timestamp means it was deleted.

alter table jobs
  add column if not exists deleted_at timestamptz;

create index if not exists jobs_deleted_at_idx on jobs(deleted_at);
