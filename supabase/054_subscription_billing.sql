-- Real subscription billing (Stripe). Ties billing to organization_id
-- (the correct model post-multi-user-migration), not user_id, which is
-- what the old activation-key trial system was keyed on. See chat/plan for
-- full reasoning — this is additive: is_trial_expired(), get_my_trial_status(),
-- and every activation-key table stay exactly as they are, just removed
-- from the active enforcement path (in src/proxy.ts, a code change, not
-- a DB one).

-- ── 1. Subscription columns on organizations ─────────────────────────────
alter table organizations
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan                   text check (plan in ('basic', 'pro')),
  -- Full set of Stripe's own subscription.status values (incomplete,
  -- incomplete_expired, trialing, active, past_due, canceled, unpaid, paused)
  -- plus our own 'grandfathered' for pre-existing orgs that never checked out.
  add column if not exists subscription_status     text check (
    subscription_status in (
      'trialing', 'active', 'past_due', 'canceled', 'incomplete',
      'incomplete_expired', 'unpaid', 'paused', 'grandfathered'
    )
  ),
  add column if not exists current_period_end      timestamptz;

create index if not exists organizations_stripe_customer_id_idx on organizations(stripe_customer_id);

-- ── 2. Webhook idempotency ────────────────────────────────────────────────
-- Stripe can and does redeliver events; the webhook route checks this
-- table before processing and skips anything already recorded.
create table if not exists stripe_events (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

-- ── 3. has_active_subscription() ─────────────────────────────────────────
-- Direct analog of the is_trial_expired() call it replaces in proxy.ts —
-- same "no params, checks auth.uid(), SECURITY DEFINER" shape, so the
-- proxy.ts call site changes minimally. 'grandfathered' counts as active
-- (see backfill below) — treated the same as 'trialing'/'active'.
create or replace function has_active_subscription()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = auth.uid()
      and o.subscription_status in ('trialing', 'active', 'grandfathered')
  );
$$;

grant execute on function has_active_subscription() to authenticated;

-- ── 4. Member-limit enforcement in add_organization_member() ────────────
-- Reuses the function that's already the sole gate for adding members
-- (Team & Users step) rather than adding a new enforcement surface.
-- Limits are hardcoded here to match src/lib/planLimits.ts exactly —
-- flagging the duplication rather than hiding it: keep both in sync if
-- pricing/limits ever change.
create or replace function add_organization_member(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id      uuid := auth.uid();
  v_caller_org_id  uuid;
  v_target_id      uuid;
  v_target_org_id  uuid;
  v_normalized     text := lower(btrim(p_email));
  v_plan           text;
  v_member_count   integer;
  v_max_members    integer;
begin
  if v_caller_id is null then
    raise exception 'Not signed in.';
  end if;

  select organization_id into v_caller_org_id
  from organization_members
  where user_id = v_caller_id
  limit 1;

  if v_caller_org_id is null then
    raise exception 'Your account has no organization yet.';
  end if;

  if not is_org_owner(v_caller_org_id) then
    raise exception 'Only the account owner can add team members.';
  end if;

  if p_role not in ('project_manager', 'project_accountant') then
    raise exception 'Invalid role for a new team member.';
  end if;

  select plan into v_plan from organizations where id = v_caller_org_id;
  v_max_members := case v_plan when 'basic' then 2 when 'pro' then 6 else null end;

  if v_max_members is not null then
    select count(*) into v_member_count from organization_members where organization_id = v_caller_org_id;
    if v_member_count >= v_max_members then
      raise exception 'Your % plan allows up to % team members. Upgrade to add more.', v_plan, v_max_members;
    end if;
  end if;

  select id into v_target_id from auth.users where lower(email) = v_normalized;

  if v_target_id is null then
    raise exception 'No Syntriq account found for that email. They''ll need to sign up first, then you can add them.';
  end if;

  select organization_id into v_target_org_id
  from organization_members
  where user_id = v_target_id
  limit 1;

  if v_target_org_id = v_caller_org_id then
    raise exception 'This person is already on your team.';
  elsif v_target_org_id is not null then
    raise exception 'This person already belongs to a different organization.';
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (v_caller_org_id, v_target_id, p_role);

  return v_target_id;
end;
$$;

grant execute on function add_organization_member(text, text) to authenticated;

-- ── 5. Grandfather every existing organization ───────────────────────────
-- Nothing already in production gets locked out or forced through
-- checkout. 'grandfathered' is treated as active by has_active_subscription()
-- above; plan is left NULL (no tier assigned) since these accounts never
-- went through a real checkout to pick one.
update organizations
set subscription_status = 'grandfathered'
where subscription_status is null;

-- ── Verification ───────────────────────────────────────────────────────
select id, name, plan, subscription_status from organizations order by created_at;

select proname from pg_proc where proname = 'has_active_subscription';
