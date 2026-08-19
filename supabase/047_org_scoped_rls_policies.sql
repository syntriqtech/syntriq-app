-- Step 2 of the multi-user migration: rewrite RLS to scope by organization
-- instead of by individual user. Schema (045) and backfill (046) already
-- ran. organization_id stays nullable in this step — NOT NULL is a later
-- step once we're confident the backfill + these policies are solid.
--
-- Deferred to later steps (not touched here): making organization_id
-- required, auth/session changes (which org a session is "acting as"),
-- Team & Users invite/permissions UI, actual org-creation signup flow.
--
-- Zero-regression design: every policy below falls back to the exact old
-- `user_id = auth.uid()` rule whenever organization_id is still NULL on a
-- row. The app doesn't set organization_id on inserts yet (that's app-layer
-- work for a later step) — without this fallback, every new row the live
-- app creates today would fail to insert immediately, before the UI is
-- even touched. Once the app starts setting organization_id on writes and
-- a cleanup sweep backfills anything still NULL, this fallback becomes
-- dead code and can be dropped when the column goes NOT NULL.

-- ── 0. Drop every existing policy on the 12 tables ──────────────────────
-- Done by introspection rather than hand-typed DROP POLICY IF EXISTS
-- statements, because company_profile's original policy name isn't known
-- (its CREATE TABLE was never captured in a tracked migration — see chat).
-- Leaving any old policy in place would be dangerous: Postgres OR's
-- multiple policies for the same command together, so a stale
-- `user_id = auth.uid()` policy left active would keep granting access
-- even after a stricter org-scoped policy is added alongside it.
do $$
declare
  r record;
  v_table text;
  v_tables text[] := array[
    'jobs','sov_line_items','pay_applications','pay_app_payments','change_orders',
    'retention_releases','billing_checkins','lien_waivers','general_contractors',
    'pay_application_certifications','company_profile','billing_platforms'
  ];
begin
  foreach v_table in array v_tables loop
    for r in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy if exists %I on %I', r.policyname, v_table);
    end loop;
  end loop;
end $$;

-- ── 1. Helper functions ──────────────────────────────────────────────────
-- SECURITY DEFINER so these can read organization_members without being
-- subject to organization_members' own RLS from inside a policy that calls
-- them (same pattern this codebase already uses for is_trial_expired() /
-- check_activation_key() reading RLS-protected tables).
create or replace function is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function has_org_write_access(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_org_id
      and user_id = auth.uid()
      and role in ('owner', 'project_manager', 'project_accountant')
  );
$$;

create or replace function is_org_owner(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_org_id and user_id = auth.uid() and role = 'owner'
  );
$$;

grant execute on function is_org_member(uuid)        to authenticated;
grant execute on function has_org_write_access(uuid) to authenticated;
grant execute on function is_org_owner(uuid)          to authenticated;

-- ── 2. organizations policies ────────────────────────────────────────────
-- No DELETE policy at all (not even for owners) — deleting an org would
-- orphan every row across 12 tables pointing to it, there's no UI for this
-- yet, and the blast radius is too large to allow client-side self-serve
-- deletion right now.
create policy "organizations_select_members"
  on organizations for select
  using (is_org_member(id));

-- Open to any authenticated user — there's no signup flow yet to gate this
-- another way, and an empty new org row alone grants no access to
-- anything. Placeholder default, not a considered decision about the
-- eventual signup flow.
create policy "organizations_insert_authenticated"
  on organizations for insert
  to authenticated
  with check (true);

create policy "organizations_update_owner_only"
  on organizations for update
  using (is_org_owner(id))
  with check (is_org_owner(id));

-- ── 3. organization_members policies ─────────────────────────────────────
create policy "organization_members_select_members"
  on organization_members for select
  using (is_org_member(organization_id));

-- NOTE: this means the very first owner-membership row for a brand-new org
-- can't be created by a plain authenticated client INSERT — nobody is an
-- owner yet to satisfy the check. Migration 046 sidestepped this by running
-- via the service-role SQL editor connection, which bypasses RLS. A future
-- "create organization" signup flow will need to be a SECURITY DEFINER
-- function that creates the org + first owner membership atomically,
-- mirroring how redeem_activation_key() already works in this codebase.
create policy "organization_members_insert_owner_only"
  on organization_members for insert
  with check (is_org_owner(organization_id));

create policy "organization_members_update_owner_only"
  on organization_members for update
  using (is_org_owner(organization_id))
  with check (is_org_owner(organization_id));

create policy "organization_members_delete_owner_only"
  on organization_members for delete
  using (is_org_owner(organization_id));

-- Self-demotion / self-removal guard. RLS USING/WITH CHECK each only ever
-- see one version of a row (old OR new), so "block this update if it
-- changes YOUR OWN role away from owner" can't be expressed as a single
-- policy predicate — that needs a trigger, which sees OLD and NEW together.
-- Also blocks an owner from deleting their own membership row entirely
-- (not just changing its role) — left unguarded, the last owner could
-- remove themselves and leave the org with zero owners, and thus nobody
-- able to fix it (only owners can touch this table at all).
create or replace function prevent_owner_self_demote()
returns trigger
language plpgsql
as $$
begin
  if old.user_id = auth.uid() and old.role = 'owner' then
    if tg_op = 'DELETE' then
      raise exception 'You cannot remove yourself as an owner of this organization.';
    end if;
    if new.role is distinct from 'owner' then
      raise exception 'You cannot change your own role away from owner.';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_owner_self_demote_upd on organization_members;
create trigger trg_prevent_owner_self_demote_upd
  before update on organization_members
  for each row execute function prevent_owner_self_demote();

drop trigger if exists trg_prevent_owner_self_demote_del on organization_members;
create trigger trg_prevent_owner_self_demote_del
  before delete on organization_members
  for each row execute function prevent_owner_self_demote();

-- ── 4. Per-table policies for the 12 organization-scoped tables ─────────
-- Generated in a loop rather than hand-written 48 times (12 tables x 4
-- commands) — the pattern is identical for every table and a loop avoids
-- copy-paste drift across that many near-identical statements. Policy
-- names kept short (e.g. "<table>_select_org_scoped") to stay safely under
-- Postgres's 63-character identifier limit for the longest table name
-- (pay_application_certifications).
do $$
declare
  v_table text;
  v_tables text[] := array[
    'jobs','sov_line_items','pay_applications','pay_app_payments','change_orders',
    'retention_releases','billing_checkins','lien_waivers','general_contractors',
    'pay_application_certifications','company_profile','billing_platforms'
  ];
begin
  foreach v_table in array v_tables loop

    -- SELECT: any org member, any role (read_only included).
    execute format(
      'create policy %I on %I for select using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and is_org_member(organization_id)))',
      v_table || '_select_org_scoped', v_table
    );

    -- INSERT/UPDATE/DELETE: owner/project_manager/project_accountant only —
    -- read_only members are excluded by has_org_write_access().
    execute format(
      'create policy %I on %I for insert with check ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id)))',
      v_table || '_insert_org_scoped', v_table
    );

    execute format(
      'create policy %I on %I for update using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id))) with check ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id)))',
      v_table || '_update_org_scoped', v_table
    );

    execute format(
      'create policy %I on %I for delete using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id)))',
      v_table || '_delete_org_scoped', v_table
    );

  end loop;
end $$;

-- ── 5. Verification ───────────────────────────────────────────────────────
-- Expect: 4 policies for each of the 12 tables, 3 for organizations
-- (no delete), 4 for organization_members. Paste this output back.
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'jobs','sov_line_items','pay_applications','pay_app_payments','change_orders',
    'retention_releases','billing_checkins','lien_waivers','general_contractors',
    'pay_application_certifications','company_profile','billing_platforms',
    'organizations','organization_members'
  )
group by tablename
order by tablename;
