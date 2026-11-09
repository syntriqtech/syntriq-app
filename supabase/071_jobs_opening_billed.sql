-- Opening billed-to-date balance for jobs imported from a prior system.
--
-- Run this in the Supabase Dashboard SQL Editor (dev/staging first).
--
-- Adds two NULLABLE columns to jobs. Nothing in the app reads them yet --
-- wiring them into pay app #1's "previous applications" is a separate task.
-- Existing rows are untouched (both columns stay NULL), and nothing here
-- changes any existing column, policy, or index.
alter table jobs
  add column if not exists opening_billed_to_date numeric,
  add column if not exists opening_billed_as_of   date;

comment on column jobs.opening_billed_to_date is
  'Total billed to date before this job was set up in Syntriq (imported from the prior system). NULL = none/unknown.';
comment on column jobs.opening_billed_as_of is
  'The date opening_billed_to_date is accurate as of.';

-- Verification: should return both columns, nullable.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'jobs'
  and column_name in ('opening_billed_to_date', 'opening_billed_as_of');
