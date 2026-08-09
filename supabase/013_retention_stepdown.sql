-- Run in Supabase Dashboard SQL Editor after 012_co_auto_number.sql
-- Adds optional step-down retention terms to jobs

alter table jobs
  add column if not exists retention_stepdown_threshold  numeric,
  add column if not exists retention_stepdown_rate_cw    numeric;
