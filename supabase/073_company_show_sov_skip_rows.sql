-- Run in Supabase Dashboard SQL Editor after 072_sov_blank_rows_before.sql
-- Company setting: show the per-line "Skip rows" box on the Schedule of Values
-- (for companies like CTI whose printed billing form is double-spaced).
-- Off by default so the SOV screen stays uncluttered.

alter table company_profile
  add column if not exists show_sov_skip_rows boolean not null default false;

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'company_profile'
  and column_name = 'show_sov_skip_rows';
