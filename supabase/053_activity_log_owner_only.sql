-- Restricts activity_log viewing to the org owner only. Originally shipped
-- (migration 052) as visible to any org member; the user decided owner-only
-- is what they actually want.
--
-- IMPORTANT: list_activity_log() is SECURITY DEFINER, so it bypasses RLS —
-- the RLS policy change below alone would NOT enforce this, since the only
-- read path in the app goes through that function. The actual enforcement
-- is the is_org_owner() check added inside the function itself. The RLS
-- policy is still tightened too, as defense-in-depth matching the pattern
-- already used elsewhere in this migration (e.g. add_organization_member()
-- checks ownership itself; RLS additionally restricts organization_members
-- writes at the table level).
--
-- INSERT stays open to any org member — everyone still does things worth
-- logging (a project manager creating a change order, an accountant
-- recording a payment); only READING the log is now owner-only.

drop policy if exists "activity_log_select_org_members" on activity_log;

create policy "activity_log_select_owner_only"
  on activity_log for select
  using (is_org_owner(organization_id));

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
  select organization_id into v_org_id
  from organization_members
  where user_id = auth.uid()
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
select policyname from pg_policies where schemaname = 'public' and tablename = 'activity_log';
