-- Fixes a real data bug found live testing invites: company_profile is one
-- row per USER, not per organization, even though the settings page says
-- "used on all generated documents." Any teammate who visited Company
-- Profile got their own disconnected, usually-blank copy — different
-- company name/address/contact/logo depending on who happened to save it
-- last, which leaks straight into pay app / lien waiver PDFs. Makes it a
-- true one-row-per-org record: any member can read it, only the owner can
-- write it.

-- ── 1. Dedup: keep one company_profile row per organization ─────────────
-- Prefers the org owner's row (matches organization_members.role = 'owner'
-- by user_id); falls back to the earliest-created row if no owner match
-- exists. Safe to run more than once — a no-op once each org has exactly
-- one row.
with ranked as (
  select
    cp.id,
    row_number() over (
      partition by cp.organization_id
      order by (om.role = 'owner') desc nulls last, cp.created_at asc
    ) as rn
  from company_profile cp
  left join organization_members om
    on om.organization_id = cp.organization_id and om.user_id = cp.user_id
  where cp.organization_id is not null
)
delete from company_profile
where id in (select id from ranked where rn > 1);

-- ── 2. Enforce it structurally going forward ─────────────────────────────
-- NULLs aren't subject to a unique constraint in Postgres, so any stray
-- pre-multi-user-migration row with organization_id still null (shouldn't
-- exist, but not this migration's job to fix) doesn't block this.
alter table company_profile
  add constraint company_profile_organization_id_key unique (organization_id);

-- ── 3. RLS: reads stay org-wide, writes become owner-only ───────────────
-- SELECT (company_profile_select_org_scoped, migration 047) is untouched —
-- every member should see the real shared profile. INSERT/UPDATE/DELETE
-- were has_org_write_access()-gated (owner + project_manager + project_
-- accountant, same as every other org-scoped table's generic policy) —
-- too permissive for company identity data specifically, so those three
-- are replaced with is_org_owner()-gated versions. The (organization_id is
-- null and user_id = auth.uid()) fallback clause matches the exact
-- zero-regression pattern every other table's policy already uses.
drop policy if exists "company_profile_insert_org_scoped" on company_profile;
drop policy if exists "company_profile_update_org_scoped" on company_profile;
drop policy if exists "company_profile_delete_org_scoped" on company_profile;

create policy "company_profile_insert_owner_only"
  on company_profile for insert
  with check ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and is_org_owner(organization_id)));

create policy "company_profile_update_owner_only"
  on company_profile for update
  using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and is_org_owner(organization_id)))
  with check ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and is_org_owner(organization_id)));

create policy "company_profile_delete_owner_only"
  on company_profile for delete
  using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and is_org_owner(organization_id)));

-- ── 4. Company logo storage: same fix, org-scoped path + owner-only ─────
-- Was keyed by uploader's user id (migration 020) — same per-person bug as
-- the table itself. New uploads go to {organizationId}/logo.png instead of
-- {userId}/logo.png (app-code change, see src/lib/companyProfileDb.ts).
-- Existing logo files under old {userId}/ paths are left in place
-- (harmless, just orphaned) — there's no SQL-level way to move Storage
-- objects, and this app has too few real users to justify anything fancier
-- than "re-upload once."
drop policy if exists "Users manage their own company logos" on storage.objects;

create policy "Org owners manage their company logo"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'company-logos' and is_org_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'company-logos' and is_org_owner(((storage.foldername(name))[1])::uuid));

-- ── Verification ───────────────────────────────────────────────────────
-- Expect every organization_id to appear at most once.
select organization_id, count(*)
from company_profile
where organization_id is not null
group by organization_id
having count(*) > 1;

select policyname from pg_policies where schemaname = 'public' and tablename = 'company_profile';
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Org owners manage their company logo';
