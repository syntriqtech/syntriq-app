-- Run in Supabase Dashboard SQL Editor after 010_jobs_job_name.sql
-- Adds the GC-issued CO number, which arrives after GC approval and is separate
-- from the internal co_number and pco_number fields.

alter table change_orders
  add column if not exists gc_co_number text;
