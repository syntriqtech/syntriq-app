-- Curated, human-readable activity log — not a generic row-diff trigger.
-- Matches the one existing precedent, pay_application_certifications
-- (migration 041), generalized across the rest of the app. See chat/plan
-- for the full reasoning and the deliberately-excluded events (SOV line
-- items, billing check-ins, GC/customer CRUD, job archive/restore).

-- ── 1. activity_log table ────────────────────────────────────────────────
-- `detail` is a human-readable snapshot captured AT LOGGING TIME (not a
-- live join) so an entry stays meaningful even after the record it refers
-- to is later deleted — e.g. deleting a job doesn't erase the fact that it
-- was created. entity_type/entity_id are kept for a future "click through
-- to the record" enhancement, not wired up in this v1.
create table if not exists activity_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  detail          text,
  created_at      timestamptz not null default now()
);

alter table activity_log enable row level security;

create index if not exists activity_log_org_created_idx on activity_log(organization_id, created_at desc);

-- Any org member can read the shared feed (transparent by design — this
-- differs from Team & Users, which stays owner-gated for management
-- actions, but everyone sees what happened).
create policy "activity_log_select_org_members"
  on activity_log for select
  using (is_org_member(organization_id));

-- Any org member can log their OWN actions for their OWN org — can't log
-- an action as someone else, and can't backdate/log into another org.
create policy "activity_log_insert_own_actions"
  on activity_log for insert
  with check (user_id = auth.uid() and is_org_member(organization_id));

-- Deliberately no UPDATE or DELETE policy at all — append-only.

-- ── 2. list_activity_log() ───────────────────────────────────────────────
-- SECURITY DEFINER for the same reason as list_organization_members()
-- (Team & Users step): user_profiles RLS only ever allows reading your own
-- row, so showing other people's names in the feed needs this.
create or replace function list_activity_log(p_limit int default 200)
returns table(
  id uuid, user_id uuid, actor_name text, action text,
  entity_type text, entity_id uuid, detail text, created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select al.id, al.user_id, coalesce(up.full_name, ''), al.action,
         al.entity_type, al.entity_id, al.detail, al.created_at
  from activity_log al
  left join user_profiles up on up.user_id = al.user_id
  where al.organization_id = (
    select organization_id from organization_members
    where user_id = auth.uid()
    limit 1
  )
  order by al.created_at desc
  limit p_limit;
$$;

grant execute on function list_activity_log(int) to authenticated;

-- ── 3. Extend certify/uncertify to also log here ────────────────────────
-- pay_application_certifications (migration 041) is untouched — it stays
-- as the pay-app-specific history on that page's Overview tab. This is
-- additive, so the general company-wide feed isn't blind to pay-app
-- activity. Logged inside the same transaction as the status change.
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

  if row_out.organization_id is not null then
    insert into activity_log (organization_id, user_id, action, entity_type, entity_id, detail)
    values (row_out.organization_id, v_user_id, 'pay_application.certified', 'pay_application', row_out.id,
            'Application #' || row_out.application_number || ' — ' || to_char(row_out.current_payment_due, 'FM$999,999,990.00'));
  end if;

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

  if row_out.organization_id is not null then
    insert into activity_log (organization_id, user_id, action, entity_type, entity_id, detail)
    values (row_out.organization_id, v_user_id, 'pay_application.uncertified', 'pay_application', row_out.id,
            'Application #' || row_out.application_number);
  end if;

  return row_out;
end;
$$;

-- ── Verification ───────────────────────────────────────────────────────
select 'activity_log table' as check_name, count(*)::text as result
from information_schema.tables where table_name = 'activity_log'
union all
select 'list_activity_log function', count(*)::text
from pg_proc where proname = 'list_activity_log'
union all
select 'certify_pay_application source mentions activity_log',
       (case when prosrc ilike '%activity_log%' then 'yes' else 'no' end)
from pg_proc where proname = 'certify_pay_application'
union all
select 'uncertify_pay_application source mentions activity_log',
       (case when prosrc ilike '%activity_log%' then 'yes' else 'no' end)
from pg_proc where proname = 'uncertify_pay_application';
