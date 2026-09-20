-- Fixes "column reference \"user_id\" is ambiguous" on the Activity page.
--
-- list_activity_log() (migration 053) declares `returns table(..., user_id
-- uuid, ...)`, which makes `user_id` an implicit PL/pgSQL variable inside
-- the function body — on top of `organization_members.user_id` being a
-- real column. The lookup of the caller's org was unqualified:
--
--   select organization_id into v_org_id
--   from organization_members
--   where user_id = auth.uid()
--
-- Postgres can't tell which `user_id` that means, so every call raised the
-- ambiguous-column error before it ever got to the owner-only check. Fix:
-- qualify it with the table alias.

create or replace function list_activity_log(p_limit int default 200)
returns table(
  id uuid, user_id uuid, actor_name text, action text,
  entity_type text, entity_id uuid, detail text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_org_id uuid;
begin
  select om.organization_id into v_org_id
  from organization_members om
  where om.user_id = auth.uid()
  limit 1;

  if v_org_id is null or not is_org_owner(v_org_id) then
    raise exception 'Only the account owner can view activity.';
  end if;

  return query
    select al.id, al.user_id, coalesce(up.full_name, ''), al.action,
           al.entity_type, al.entity_id, al.detail, al.created_at
    from activity_log al
    left join user_profiles up on up.user_id = al.user_id
    where al.organization_id = v_org_id
    order by al.created_at desc
    limit p_limit;
end;
$$;

grant execute on function list_activity_log(int) to authenticated;

-- ── Verification ───────────────────────────────────────────────────────
-- Do NOT call list_activity_log() itself here to verify — the SQL Editor
-- has no authenticated app user, so auth.uid() is null and the owner-only
-- check always raises. Worse, Supabase's SQL Editor runs a pasted script
-- as one transaction, so that raise would roll back the CREATE OR REPLACE
-- above too (this is what happened the first time this migration ran).
-- Confirm the fix landed by reading the function definition back instead:
select prosrc from pg_proc where proname = 'list_activity_log';
-- Expect to see "where om.user_id = auth.uid()" (qualified), not a bare
-- "where user_id = auth.uid()". Then verify for real by reloading the
-- Activity page in the app itself, logged in as the account owner.
