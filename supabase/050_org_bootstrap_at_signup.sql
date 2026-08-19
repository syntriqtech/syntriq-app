-- Closes the last deliberately-deferred gap from the multi-user migration:
-- there has been no code path anywhere that creates an organization. A
-- brand-new signup ended up with organization_id = NULL forever (covered
-- by the RLS fallback from migration 047, but with no way to ever get a
-- real org). This is exactly the fix migration 047's own comment on
-- organization_members_insert_owner_only called for.

-- ── 1. bootstrap_organization() ──────────────────────────────────────────
-- SECURITY DEFINER so it can insert the first organization_members row for
-- a brand-new org, bypassing organization_members_insert_owner_only
-- (which requires the caller to already be an owner — impossible for a
-- org's very first membership row via a plain client insert; same
-- chicken-and-egg problem is_org_owner()/redeem_activation_key() already
-- solve elsewhere in this codebase the same way).
--
-- Idempotent: if the calling user already belongs to an organization,
-- returns their existing organization_id instead of creating a duplicate.
-- Defends against a double-submit of the company-setup form calling this
-- twice; does NOT fully close a true concurrent race (accepted, see chat/
-- plan — not worth row-locking machinery for a low-traffic pre-launch app).
create or replace function bootstrap_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
begin
  if v_user_id is null then
    raise exception 'Not signed in.';
  end if;

  select organization_id into v_org_id
  from organization_members
  where user_id = v_user_id
  limit 1;

  if v_org_id is not null then
    return v_org_id;
  end if;

  insert into organizations (name) values (p_name)
  returning id into v_org_id;

  insert into organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  return v_org_id;
end;
$$;

grant execute on function bootstrap_organization(text) to authenticated;

-- ── 2. Lock down direct client inserts into organizations ───────────────
-- bootstrap_organization() above is now the one real way to create an org,
-- and being SECURITY DEFINER it bypasses this policy entirely — so the
-- permissive placeholder policy from migration 047 (flagged there as "not
-- a considered decision about the eventual signup flow") no longer needs
-- to exist.
drop policy if exists "organizations_insert_authenticated" on organizations;

-- ── Verification ───────────────────────────────────────────────────────
select proname from pg_proc where proname = 'bootstrap_organization';

select policyname from pg_policies
where schemaname = 'public' and tablename = 'organizations';
