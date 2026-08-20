-- Enforces the Basic/Pro seat cap (2 / 6 members, owner included) as a real
-- database constraint, not just an app-layer check.
--
-- Why a trigger and not just the existing check inside add_organization_member()
-- (054): organization_members' own RLS insert policy
-- ("organization_members_insert_owner_only", migration 045) lets an org owner
-- INSERT into organization_members directly via a plain client call —
-- add_organization_member() is a convenience path, not the only path. A
-- BEFORE INSERT trigger is the actual backstop regardless of which one is used.
--
-- Cap rule: plan = 'basic' -> 2, everything else (pro, or NULL/grandfathered)
-- -> 6. Grandfathered orgs (pre-billing, plan intentionally left NULL by 054)
-- are treated as Pro-equivalent here, matching the same "grandfathered = Pro"
-- precedent already used for the sidebar plan badge and AI-import gating.

-- ── 1. Seat cap on INSERT into organization_members ──────────────────────
create or replace function enforce_member_seat_cap()
returns trigger
language plpgsql
as $$
declare
  v_plan         text;
  v_max_members  integer;
  v_member_count integer;
begin
  select plan into v_plan from organizations where id = new.organization_id;
  v_max_members := case when v_plan = 'basic' then 2 else 6 end;

  select count(*) into v_member_count
  from organization_members
  where organization_id = new.organization_id;

  if v_member_count >= v_max_members then
    raise exception 'This organization has reached its % plan team member limit (%). Remove a member or upgrade to add another.',
      coalesce(v_plan, 'current'), v_max_members;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_member_seat_cap on organization_members;
create trigger trg_enforce_member_seat_cap
  before insert on organization_members
  for each row execute function enforce_member_seat_cap();

-- ── 2. Block a plan change that would leave an org over its new cap ──────
-- Fires on any UPDATE to organizations.plan, regardless of writer — covers
-- the Stripe webhook (service-role client bypasses RLS but not triggers)
-- and any future direct plan edit, not just a specific API route.
create or replace function prevent_over_cap_plan_change()
returns trigger
language plpgsql
as $$
declare
  v_new_max      integer;
  v_member_count integer;
begin
  if new.plan is distinct from old.plan then
    v_new_max := case when new.plan = 'basic' then 2 else 6 end;

    select count(*) into v_member_count
    from organization_members
    where organization_id = new.id;

    if v_member_count > v_new_max then
      raise exception 'Cannot switch this organization to the % plan: it has % team members, which is over the % plan''s limit of %. Remove members down to % or fewer first.',
        new.plan, v_member_count, new.plan, v_new_max, v_new_max;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_over_cap_plan_change on organizations;
create trigger trg_prevent_over_cap_plan_change
  before update on organizations
  for each row execute function prevent_over_cap_plan_change();

-- ── 3. Keep add_organization_member()'s early check in sync ──────────────
-- Superseded as the actual backstop by trigger #1 above (kept here only for
-- a friendlier, earlier error inside the RPC path). Previously treated a
-- NULL plan as unlimited; now matches the same basic=2/else=6 rule as the
-- trigger, so grandfathered orgs are capped at 6 everywhere consistently.
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
  v_max_members := case when v_plan = 'basic' then 2 else 6 end;

  select count(*) into v_member_count from organization_members where organization_id = v_caller_org_id;
  if v_member_count >= v_max_members then
    raise exception 'Your % plan allows up to % team members. Upgrade to add more.', coalesce(v_plan, 'current'), v_max_members;
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

-- ── Verification ───────────────────────────────────────────────────────
-- Expect two new triggers, and a member_count <= seat_cap for every org.
select tgname, tgrelid::regclass as on_table
from pg_trigger
where tgname in ('trg_enforce_member_seat_cap', 'trg_prevent_over_cap_plan_change');

select
  o.id,
  o.name,
  o.plan,
  o.subscription_status,
  count(om.id) as member_count,
  case when o.plan = 'basic' then 2 else 6 end as seat_cap
from organizations o
left join organization_members om on om.organization_id = o.id
group by o.id, o.name, o.plan, o.subscription_status
order by o.created_at;
