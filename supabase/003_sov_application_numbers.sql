-- Run this in the Supabase Dashboard SQL Editor (same place as the previous migrations).
-- This lets each pay application have its own saved Schedule of Values, instead of
-- every application overwriting the same one set of line items for a job.

alter table sov_line_items
  add column if not exists application_number text not null default '1',
  add column if not exists application_date date not null default current_date,
  add column if not exists period_to date not null default current_date;

create index if not exists sov_line_items_job_application_idx
  on sov_line_items(job_id, application_number);
