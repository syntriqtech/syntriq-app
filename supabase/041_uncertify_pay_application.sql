-- Run this in the Supabase Dashboard SQL Editor.
-- Adds an "Uncertify" action for pay applications, reverting a certified
-- application back to "submitted" (editable) — for accidental certifications.
--
-- Three pieces:
-- 1. pay_application_certifications — an append-only event log (certified /
--    uncertified, who, when). A pay app can be certified, uncertified, and
--    re-certified multiple times; this preserves that whole history rather
--    than a single certified_by/certified_at pair that would only ever hold
--    the latest event.
-- 2. enforce_pay_app_certified_lock() is widened to allow the status/
--    certified_date change ONLY when a transaction-local flag
--    (app.allow_uncertify) is set — which only uncertify_pay_application()
--    below ever sets. This keeps the lock trigger's existing protections
--    intact for every other path (a raw client .update() still can't touch
--    a certified row), while giving the audited RPC a legitimate way through.
-- 3. uncertify_pay_application() — the RPC itself. Requires status to
--    currently be exactly 'certified' (not 'paid' — a fully-paid application
--    is out of scope here) and requires zero payments recorded against it
--    (partial payments on an otherwise-'certified' app would be left
--    orphaned against a no-longer-certified application otherwise, since
--    nothing else in the schema cascades/cleans those up). Clears
--    certified_date back to null and logs the event.

create table if not exists pay_application_certifications (
  id          uuid primary key default gen_random_uuid(),
  pay_app_id  uuid not null references pay_applications(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null check (action in ('certified', 'uncertified')),
  occurred_at timestamptz not null default now()
);

alter table pay_application_certifications enable row level security;

create policy "Users manage their own certification history"
  on pay_application_certifications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists pay_application_certifications_pay_app_id_idx
  on pay_application_certifications(pay_app_id);

create or replace function enforce_pay_app_certified_lock()
returns trigger
language plpgsql
as $$
begin
  -- Only uncertify_pay_application() ever sets this, for the one row it's
  -- actively reverting, inside its own transaction.
  if coalesce(current_setting('app.allow_uncertify', true), 'false') = 'true' then
    return new;
  end if;

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

create or replace function uncertify_pay_application(
  p_pay_app_id uuid
)
returns pay_applications
language plpgsql
as $$
declare
  row_out      pay_applications%rowtype;
  v_user_id    uuid;
  v_total_paid numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not signed in.';
  end if;

  select * into row_out
  from pay_applications
  where id = p_pay_app_id
  for update;

  if not found then
    raise exception 'Pay application % not found.', p_pay_app_id;
  end if;

  if row_out.status <> 'certified' then
    raise exception 'Only a certified application can be uncertified (current status: %).', row_out.status;
  end if;

  select coalesce(sum(amount_paid), 0) into v_total_paid
  from pay_app_payments
  where pay_app_id = p_pay_app_id and deleted_at is null;

  if v_total_paid > 0 then
    raise exception 'Cannot uncertify — % has already been recorded in payments against this application. Delete those payment records first.',
      to_char(v_total_paid, 'FM999,999,990.00');
  end if;

  perform set_config('app.allow_uncertify', 'true', true);

  update pay_applications
  set status = 'submitted',
      certified_date = null
  where id = p_pay_app_id
  returning * into row_out;

  insert into pay_application_certifications (pay_app_id, user_id, action)
  values (p_pay_app_id, v_user_id, 'uncertified');

  return row_out;
end;
$$;

-- Also log the (already-existing) certify path going forward, so the same
-- history table captures the full certify/uncertify/re-certify sequence.
create or replace function certify_pay_application(
  p_pay_app_id     uuid,
  p_certified_date date default current_date
)
returns pay_applications
language plpgsql
as $$
declare
  row_out   pay_applications%rowtype;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not signed in.';
  end if;

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

  if row_out.current_payment_due <= 0 then
    raise exception 'This pay application totals $0.00 — add billing amounts before certifying.';
  end if;

  update pay_applications
  set status = 'certified',
      certified_date = p_certified_date
  where id = p_pay_app_id
  returning * into row_out;

  insert into pay_application_certifications (pay_app_id, user_id, action)
  values (p_pay_app_id, v_user_id, 'certified');

  return row_out;
end;
$$;
