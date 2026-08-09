-- Run this in the Supabase Dashboard SQL Editor.
-- Adds a human-readable Job Name field to jobs.
-- Existing rows get '' (empty string) — the app will surface them as needing this filled in.

alter table jobs
  add column if not exists job_name text not null default '';
