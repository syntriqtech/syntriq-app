-- Run in Supabase Dashboard SQL Editor after 013_retention_stepdown.sql
-- Adds reversible job archiving

alter table jobs
  add column if not exists archived_at timestamptz;

create index if not exists jobs_archived_at_idx on jobs(archived_at);
