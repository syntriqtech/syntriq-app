-- Run this in the Supabase Dashboard SQL Editor.
-- Adds payment-discrepancy tracking to retention_releases:
-- 1. `discrepancy` — a generated column, always (amount_released - amount_paid).
--    Positive = underpaid, negative = overpaid, zero = exact match. This is
--    never user-entered — Postgres computes and stores it automatically and
--    rejects any attempt to write to it directly, so it can't drift from the
--    two source columns.
-- 2. `discrepancy_note` — optional free text explaining why a payment didn't
--    match the release amount. Distinct from the existing `notes` column,
--    which already holds billing-time notes and the wizard's per-line audit
--    JSON — this one is captured later, at Mark Paid time.

alter table retention_releases
  add column if not exists discrepancy numeric generated always as (amount_released - amount_paid) stored;

alter table retention_releases
  add column if not exists discrepancy_note text not null default '';
