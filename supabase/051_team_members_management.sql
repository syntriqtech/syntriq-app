-- Team & Users page: lets an owner add existing Syntriq accounts to their
-- team by email, and gives every org member a way to see who's on their
-- team. Deliberately NOT email invitations (see chat/plan) — no email
-- infrastructure or pending-invite records exist in this codebase, and
-- adding them is a meaningfully bigger effort than this page.
--
-- Both functions are SECURITY DEFINER out of necessity, not convenience:
-- user_profiles' RLS only ever allows reading your OWN row (migration 024,
-- "auth.uid() = user_id"), and auth.users.email isn't queryable by the
-- client at all. Without these, the page couldn't show anything beyond
-- raw user IDs for teammates other than yourself.

-- ── 1. list_organization_members() ───────────────────────────────────────
-- Read-only, callable by any org member (not owner-gated) — matches the
-- intent of the existing organization_members_select_members RLS policy,
-- this just also resolves display info that policy alone can't reach.
create or replace function list_organization_members()
returns table(user_id uuid, email text, full_name text, role text, joined_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select om.user_id, u.email, coalesce(up.full_name, ''), om.role, om.created_at
  from organization_members om
  join auth.users u on u.id = om.user_id
  left join user_profiles up on up.user_id = om.user_id
  where om.organization_id = (
    select organization_id from organization_members
    where user_id = auth.uid()
    limit 1
  )
  order by om.created_at asc;
$$;

grant execute on function list_organization_members() to authenticated;

-- ── 2. add_organization_member() ─────────────────────────────────────────
-- Owner-only. Resolves an email to an existing Syntriq account and adds
-- them to the caller's org. Deliberately rejects p_role = 'owner' — this UI
-- doesn't expose promoting someone to co-owner, even though the underlying
-- role check constraint would otherwise allow it.
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
select proname from pg_proc
where proname in ('list_organization_members', 'add_organization_member');
