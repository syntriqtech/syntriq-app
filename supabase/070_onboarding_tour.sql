-- First-run guided tour progress, stored per USER (not per organization) so
-- every teammate gets their own intro.
--
-- Additive and nullable: no existing column or policy changes. The existing
-- "auth.uid() = user_id" RLS policies from migration 024 already cover new
-- columns on this table.
--
-- NULL means "never started" and is treated the same as 'not_started' by the
-- app, so brand-new signups (whose profile row is created without these
-- columns) automatically get the tour.

alter table user_profiles
  add column if not exists tour_phase1_status text
    check (tour_phase1_status in ('not_started', 'in_progress', 'completed', 'skipped')),
  add column if not exists tour_phase2_status text
    check (tour_phase2_status in ('not_started', 'in_progress', 'completed', 'skipped')),
  add column if not exists tour_last_step text;

-- Existing users should NOT see the tour automatically (they remain able to
-- replay it from Help & Support). Mark every profile that exists right now as
-- skipped.
--
-- RUN THIS FILE ONLY ONCE. Running it again later would also mark any new,
-- not-yet-started users as skipped.
update user_profiles
set tour_phase1_status = 'skipped',
    tour_phase2_status = 'skipped'
where tour_phase1_status is null
  and tour_phase2_status is null;

-- ── Verification ───────────────────────────────────────────────────────
select tour_phase1_status, tour_phase2_status, count(*)
from user_profiles
group by 1, 2;
