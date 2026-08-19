-- Step 3 of the multi-user migration: gives the app a way to know "which
-- organization is this write for," and fixes billing_platforms' unique
-- constraint so it actually behaves as the shared per-org list it was
-- meant to be since step 1.
--
-- Does NOT touch signup/company-setup (org creation there is deferred to a
-- future step) and does NOT touch any RLS policy or read path — reads are
-- already correctly scoped by the organization-aware policies from
-- migration 047.

-- ── 1. get_my_organization_id() ──────────────────────────────────────────
-- Mirrors the existing get_my_trial_status() pattern (044). Returns NULL
-- for a user with no organization_members row (every user today except
-- future org-less signups) — callers are expected to handle NULL, same as
-- every organization_id column already does.
-- LIMIT 1 is a known simplification: there's no multi-org-per-user
-- membership UI, matching the one-org-per-user assumption this whole
-- migration has used since step 1.
create or replace function get_my_organization_id()
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select organization_id from organization_members
  where user_id = auth.uid()
  limit 1;
$$;

grant execute on function get_my_organization_id() to authenticated;

-- ── 2. billing_platforms: fix the stale per-user uniqueness ─────────────
-- organization_id was added to this table in migration 045 specifically so
-- a company's custom billing-platform list could be shared across team
-- members, but the UNIQUE constraint was never updated to match — it's
-- still (user_id, name), meaning two teammates could each add their own
-- "Procore" entry. Table is empty today, so no data migration needed.
alter table billing_platforms drop constraint if exists billing_platforms_user_id_name_key;

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'billing_platforms'::regclass
    and contype = 'u';

  if v_constraint_name is not null and v_constraint_name <> 'billing_platforms_organization_id_name_key' then
    execute format('alter table billing_platforms drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table billing_platforms
  add constraint billing_platforms_organization_id_name_key unique (organization_id, name);

-- ── 3. Propagate organization_id through the 3 RPC functions ────────────
-- Sourced from the row being acted on (old_row / row_out), not from a
-- fresh get_my_organization_id() lookup — the row's own org is the correct
-- source of truth, not whichever member happens to be calling.

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
  for update;

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
    job_id, user_id, organization_id, application_number, application_date, period_to,
    amount_billed, current_payment_due, revision_number, status,
    revision_reason, is_current_revision
  ) values (
    old_row.job_id, auth.uid(), old_row.organization_id, old_row.application_number,
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

  insert into pay_application_certifications (pay_app_id, user_id, organization_id, action)
  values (p_pay_app_id, v_user_id, row_out.organization_id, 'certified');

  return row_out;
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

  insert into pay_application_certifications (pay_app_id, user_id, organization_id, action)
  values (p_pay_app_id, v_user_id, row_out.organization_id, 'uncertified');

  return row_out;
end;
$$;

-- ── Verification ───────────────────────────────────────────────────────
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'billing_platforms'::regclass and contype = 'u';
