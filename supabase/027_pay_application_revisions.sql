-- Run in Supabase Dashboard SQL Editor after 026_company_address_split.sql
-- Adds revision tracking to pay_applications, a lien_waivers table, and the
-- Postgres functions/triggers that enforce the certified-lock and revision
-- workflow server-side (no API-route layer in this app — the database is
-- the enforcement boundary).

-- ── 1. New columns on pay_applications ──────────────────────────────────────
-- current_payment_due re-declared defensively: it already exists live in
-- production but was never captured in a migration file.
alter table pay_applications
  add column if not exists current_payment_due numeric,
  add column if not exists revision_number integer not null default 1,
  add column if not exists status text not null default 'draft'
    check (status in ('draft','submitted','revised','certified','paid')),
  add column if not exists revision_reason text,
  add column if not exists superseded_by_revision_id uuid
    references pay_applications(id) on delete set null,
  add column if not exists is_current_revision boolean not null default true,
  add column if not exists certified_date date;

-- ── 2. Backfill existing rows (must run before the lock trigger exists) ────
-- Rows with at least one non-deleted payment => certified, or paid if the
-- payments already cover current_payment_due. certified_date backfilled
-- from the earliest payment date.
with paid_totals as (
  select pay_app_id,
         sum(amount_paid) as total_paid,
         min(payment_date) as earliest_payment
  from pay_app_payments
  where deleted_at is null
  group by pay_app_id
)
update pay_applications pa
set status = case
               when pt.total_paid >= coalesce(pa.current_payment_due, 0) - 0.01 then 'paid'
               else 'certified'
             end,
    certified_date = pt.earliest_payment
from paid_totals pt
where pa.id = pt.pay_app_id
  and pa.deleted_at is null
  and pa.status = 'draft'; -- only touch rows still at the fresh column default

-- Rows with no payments at all => submitted (this app has no "save as draft"
-- step today; every row created via the existing SOV-save flow is already
-- effectively submitted).
update pay_applications pa
set status = 'submitted'
where pa.deleted_at is null
  and pa.status = 'draft'
  and not exists (
    select 1 from pay_app_payments pp
    where pp.pay_app_id = pa.id and pp.deleted_at is null
  );

-- ── 3. One-current-revision-per-application-number constraint ──────────────
-- Excludes soft-deleted rows so the existing soft-delete/duplicate-recovery
-- flow (purgeDeletedPayApplications + retry, see sov/page.tsx handleSave)
-- keeps working. NOTE: if this index creation fails, it means a real
-- duplicate live row already exists for some (job_id, application_number) —
-- investigate with the query below before re-running:
--   select job_id, application_number, count(*) from pay_applications
--   where deleted_at is null group by 1,2 having count(*) > 1;
create unique index if not exists pay_applications_one_current_idx
  on pay_applications (job_id, application_number)
  where is_current_revision and deleted_at is null;

create index if not exists pay_applications_job_app_num_idx
  on pay_applications (job_id, application_number);
create index if not exists pay_applications_superseded_by_idx
  on pay_applications (superseded_by_revision_id);
create index if not exists pay_applications_status_idx
  on pay_applications (status);

-- ── 4. lien_waivers table ────────────────────────────────────────────────────
-- Persists each waiver-generation event so staleness can be detected later.
-- application_number (not pay_applications.id) is the durable correlation
-- key, matching how the rest of the app (sov_line_items, lien-waivers page)
-- already references applications. generated_against_pay_application_id is
-- a best-effort pointer to the exact row that was current at generation
-- time, kept nullable/ON DELETE SET NULL since it's for convenience only.
create table if not exists lien_waivers (
  id                                    uuid primary key default gen_random_uuid(),
  job_id                                uuid not null references jobs(id) on delete cascade,
  user_id                               uuid not null references auth.users(id) on delete cascade,
  application_number                    text not null,
  kind                                  text not null
                                          check (kind in (
                                            'conditional-progress','unconditional-progress',
                                            'conditional-final','unconditional-final'
                                          )),
  amount_of_check                       numeric not null default 0,
  through_date                          date,
  signature_date                        date,
  generated_against_pay_application_id  uuid references pay_applications(id) on delete set null,
  generated_against_revision_number     integer not null default 1,
  stale                                 boolean not null default false,
  stale_detected_at                     timestamptz,
  generated_at                          timestamptz not null default now(),
  deleted_at                            timestamptz
);

alter table lien_waivers enable row level security;

create policy "Users manage their own lien waivers"
  on lien_waivers for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists lien_waivers_job_app_idx
  on lien_waivers (job_id, application_number);
create index if not exists lien_waivers_stale_idx
  on lien_waivers (job_id, application_number) where stale and deleted_at is null;

-- ── 5. create_pay_application_revision() ────────────────────────────────────
-- Atomically: locks the current row, validates eligibility, inserts the new
-- revision row, flips the old row to superseded. Runs SECURITY INVOKER
-- (the default — do NOT mark this SECURITY DEFINER) so RLS still scopes
-- both the lookup and the insert to the caller's own rows; a stray call
-- with someone else's pay_app_id simply resolves to "not found".
create or replace function create_pay_application_revision(
  p_pay_app_id           uuid,
  p_amount_billed        numeric,
  p_current_payment_due  numeric,
  p_application_date     date,
  p_period_to            date,
  p_revision_reason      text
)
returns pay_applications
language plpgsql
as $$
declare
  old_row pay_applications%rowtype;
  new_row pay_applications%rowtype;
begin
  if p_revision_reason is null or btrim(p_revision_reason) = '' then
    raise exception 'A revision reason is required.';
  end if;

  select * into old_row
  from pay_applications
  where id = p_pay_app_id
  for update; -- row lock makes the eligibility check + two-row write race-safe

  if not found then
    raise exception 'Pay application % not found.', p_pay_app_id;
  end if;

  if old_row.deleted_at is not null or not old_row.is_current_revision then
    raise exception 'Only the current revision of a pay application can be revised.';
  end if;

  if old_row.status not in ('submitted', 'revised') then
    raise exception 'Only a submitted or revised application can be revised (current status: %).', old_row.status;
  end if;

  insert into pay_applications (
    job_id, user_id, application_number, application_date, period_to,
    amount_billed, current_payment_due, revision_number, status,
    revision_reason, is_current_revision
  ) values (
    old_row.job_id, auth.uid(), old_row.application_number,
    p_application_date, p_period_to, p_amount_billed, p_current_payment_due,
    old_row.revision_number + 1, 'revised', p_revision_reason, true
  )
  returning * into new_row;

  update pay_applications
  set is_current_revision = false,
      superseded_by_revision_id = new_row.id
  where id = old_row.id;

  return new_row;
end;
$$;

-- ── 6. certify_pay_application() ─────────────────────────────────────────────
create or replace function certify_pay_application(
  p_pay_app_id     uuid,
  p_certified_date date default current_date
)
returns pay_applications
language plpgsql
as $$
declare
  row_out pay_applications%rowtype;
begin
  select * into row_out
  from pay_applications
  where id = p_pay_app_id
  for update;

  if not found then
    raise exception 'Pay application % not found.', p_pay_app_id;
  end if;

  if row_out.deleted_at is not null or not row_out.is_current_revision then
    raise exception 'Only the current revision of a pay application can be certified.';
  end if;

  if row_out.status not in ('submitted', 'revised') then
    raise exception 'Only a submitted or revised application can be marked certified (current status: %).', row_out.status;
  end if;

  update pay_applications
  set status = 'certified',
      certified_date = p_certified_date
  where id = p_pay_app_id
  returning * into row_out;

  return row_out;
end;
$$;

-- ── 7. Certified-lock trigger ────────────────────────────────────────────────
-- Once a row is certified or paid, amount/date/revision fields are frozen
-- forever, and status may only toggle between 'certified' and 'paid' (the
-- payment-driven auto-advance/revert below). pdf_url and deleted_at are
-- intentionally NOT checked — PDFs can still be (re)saved, and soft-delete
-- bookkeeping still works, on a certified row.
create or replace function enforce_pay_app_certified_lock()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('certified', 'paid') then
    if new.amount_billed              is distinct from old.amount_billed
       or new.current_payment_due     is distinct from old.current_payment_due
       or new.application_date        is distinct from old.application_date
       or new.period_to               is distinct from old.period_to
       or new.revision_reason         is distinct from old.revision_reason
       or new.revision_number         is distinct from old.revision_number
       or new.is_current_revision     is distinct from old.is_current_revision
       or new.superseded_by_revision_id is distinct from old.superseded_by_revision_id
       or new.certified_date          is distinct from old.certified_date
    then
      raise exception 'This pay application has been certified and can no longer be edited or revised. Corrections must go into the next billing period.';
    end if;

    if new.status is distinct from old.status and new.status not in ('certified', 'paid') then
      raise exception 'Invalid status transition on a certified pay application (% -> %).', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_pay_app_certified_lock on pay_applications;
create trigger trg_enforce_pay_app_certified_lock
  before update on pay_applications
  for each row
  execute function enforce_pay_app_certified_lock();

-- ── 8. Auto-advance / auto-revert paid status from pay_app_payments ─────────
-- Fires on insert, update (soft-delete/restore toggles deleted_at), and
-- delete (permanent delete) so status stays correct no matter how payments
-- change later.
create or replace function sync_pay_application_paid_status()
returns trigger
language plpgsql
as $$
declare
  v_pay_app_id uuid := coalesce(new.pay_app_id, old.pay_app_id);
  v_total_paid numeric;
  v_due        numeric;
  v_status     text;
begin
  select coalesce(sum(amount_paid), 0) into v_total_paid
  from pay_app_payments
  where pay_app_id = v_pay_app_id and deleted_at is null;

  select current_payment_due, status into v_due, v_status
  from pay_applications
  where id = v_pay_app_id
  for update;

  if v_status is null then
    return coalesce(new, old);
  end if;

  if v_status = 'certified' and v_due > 0 and v_total_paid >= v_due - 0.01 then
    update pay_applications set status = 'paid' where id = v_pay_app_id;
  elsif v_status = 'paid' and (v_due <= 0 or v_total_paid < v_due - 0.01) then
    update pay_applications set status = 'certified' where id = v_pay_app_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_pay_app_paid_status_ins on pay_app_payments;
drop trigger if exists trg_sync_pay_app_paid_status_upd on pay_app_payments;
drop trigger if exists trg_sync_pay_app_paid_status_del on pay_app_payments;

create trigger trg_sync_pay_app_paid_status_ins after insert on pay_app_payments
  for each row execute function sync_pay_application_paid_status();
create trigger trg_sync_pay_app_paid_status_upd after update on pay_app_payments
  for each row execute function sync_pay_application_paid_status();
create trigger trg_sync_pay_app_paid_status_del after delete on pay_app_payments
  for each row execute function sync_pay_application_paid_status();

-- ── 9. Block recording a payment unless the application is certified ───────
-- Guards INSERT only — restoring a previously-recorded payment (an UPDATE
-- that clears deleted_at) is always allowed regardless of current status.
create or replace function enforce_payment_requires_certified()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from pay_applications where id = new.pay_app_id;
  if v_status is null then
    raise exception 'Pay application % not found.', new.pay_app_id;
  end if;
  if v_status <> 'certified' then
    raise exception 'Cannot record a payment on a pay application that is not certified (current status: %).', v_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_requires_certified on pay_app_payments;
create trigger trg_enforce_payment_requires_certified
  before insert on pay_app_payments
  for each row
  execute function enforce_payment_requires_certified();

-- ── 10. Flag existing lien waivers stale when a revision is created ────────
create or replace function flag_stale_lien_waivers()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'revised' and new.revision_number > 1 then
    update lien_waivers
    set stale = true,
        stale_detected_at = now()
    where job_id = new.job_id
      and application_number = new.application_number
      and stale = false
      and deleted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flag_stale_lien_waivers on pay_applications;
create trigger trg_flag_stale_lien_waivers
  after insert on pay_applications
  for each row
  execute function flag_stale_lien_waivers();
