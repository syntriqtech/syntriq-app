-- Run this in the Supabase Dashboard SQL Editor.
-- Adds CTI PM name field to jobs so it can be tracked from job creation/import.

alter table jobs
  add column if not exists cti_pm text not null default '';
