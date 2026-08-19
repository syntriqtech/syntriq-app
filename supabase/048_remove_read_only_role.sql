-- Simplifies the organization_members role model: read_only was designed
-- in migration 045 but turns out not to be needed. Removes it from the
-- allowed roles, leaving owner/project_manager/project_accountant, all
-- with equal read+write access.
--
-- No RLS or helper function changes needed. has_org_write_access() (047)
-- already only ever granted write access to these same three roles — it
-- simply now covers every valid role instead of excluding one, since
-- read_only can no longer exist. is_org_member() vs. has_org_write_access()
-- staying as two separate functions (rather than collapsing them into one,
-- now-redundant check) is a deliberate choice not to touch already-working
-- RLS policies with no behavior change to gain.
--
-- Safe to run: only one organization_members row exists today (the CTI
-- owner), and the guard below refuses to proceed if any row is somehow
-- already 'read_only' rather than silently corrupting data.

do $$
declare
  v_constraint_name  text;
  v_read_only_count  integer;
begin
  select count(*) into v_read_only_count
  from organization_members
  where role = 'read_only';

  if v_read_only_count > 0 then
    raise exception '% row(s) currently have role = read_only — resolve those before dropping the role from the schema.', v_read_only_count;
  end if;

  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'organization_members'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%';

  if v_constraint_name is not null then
    execute format('alter table organization_members drop constraint %I', v_constraint_name);
  end if;

  alter table organization_members
    add constraint organization_members_role_check
    check (role in ('owner', 'project_manager', 'project_accountant'));
end $$;

-- Verification — paste back both results.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'organization_members'::regclass and contype = 'c';

select role, count(*) from organization_members group by role;
