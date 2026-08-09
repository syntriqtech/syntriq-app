-- Run in Supabase Dashboard SQL Editor after 011_change_orders_gc_co_number.sql
-- co_number column already exists (008_change_orders.sql).
-- This adds a BEFORE INSERT trigger that auto-assigns a zero-padded sequential
-- CO number per job (001, 002, 003 ...).  Numbers are never reused — voided or
-- rejected COs keep their number and are included in the MAX so the next CO
-- skips over any gaps.

-- ── Trigger function ─────────────────────────────────────────────────────────
create or replace function assign_co_number()
returns trigger
language plpgsql
as $$
declare
  next_num integer;
begin
  -- Only assign if caller didn't supply one explicitly
  if new.co_number is null then
    select coalesce(
      max(case when co_number ~ '^\d+$' then co_number::integer end),
      0
    ) + 1
    into next_num
    from change_orders
    where job_id = new.job_id;

    new.co_number := lpad(next_num::text, 3, '0');
  end if;
  return new;
end;
$$;

-- ── Trigger ──────────────────────────────────────────────────────────────────
drop trigger if exists trg_assign_co_number on change_orders;

create trigger trg_assign_co_number
  before insert on change_orders
  for each row
  execute function assign_co_number();

-- ── Back-fill existing records that have no co_number ────────────────────────
-- Assigns numbers in creation order (oldest = 001) per job.
-- Includes all rows (pending, approved, voided, deleted) so gaps are correct.
with ranked as (
  select
    id,
    lpad(
      row_number() over (partition by job_id order by created_at, id)::text,
      3, '0'
    ) as new_num
  from change_orders
  where co_number is null
)
update change_orders
set co_number = ranked.new_num
from ranked
where change_orders.id = ranked.id;
