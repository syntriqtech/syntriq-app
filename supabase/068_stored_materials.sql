-- Run in Supabase Dashboard SQL Editor after 067_gc_library.sql
--
-- Stored Materials billing: supporting entries + documents attached to a pay
-- application. Does NOT change any billing math — the SOV line's
-- stored_materials number is still the source of truth for G702/G703; these
-- tables just record what's behind it.
--
-- Design notes:
--  * sov_line_items rows are deleted and re-inserted on every SOV save (see
--    saveSovItems), so their ids are not stable. Entries link to a line by
--    (job_id, application_number, sov_item, sov_kind) instead.
--  * origin_entry_id links an entry carried into a later pay application back
--    to the entry it came from, so "installed to date" can be summed across
--    applications (prevents double billing).
--  * Soft-delete only: no DELETE policy at all. (Rows can still disappear via
--    ON DELETE CASCADE if a pay application / job row itself is purged.)
--  * RLS: same zero-regression fallback as 047 — rows with a NULL
--    organization_id fall back to user_id = auth.uid().

-- ── 1. stored_material_entries ───────────────────────────────────────────
create table if not exists stored_material_entries (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references organizations(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  pay_application_id    uuid not null references pay_applications(id) on delete cascade,
  job_id                uuid not null references jobs(id) on delete cascade,
  application_number    text not null,
  sov_item              text not null,
  sov_kind              text not null default 'line' check (sov_kind in ('line', 'change_order')),
  origin_entry_id       uuid references stored_material_entries(id) on delete set null,
  vendor                text not null default '',
  description           text not null default '',
  amount                numeric not null default 0 check (amount >= 0),
  storage_location      text not null default 'onsite' check (storage_location in ('onsite', 'offsite')),
  installed_this_period numeric not null default 0 check (installed_this_period >= 0),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index if not exists stored_material_entries_pay_app_idx
  on stored_material_entries (pay_application_id) where deleted_at is null;
create index if not exists stored_material_entries_job_idx
  on stored_material_entries (job_id) where deleted_at is null;
create index if not exists stored_material_entries_origin_idx
  on stored_material_entries (origin_entry_id);

-- ── 2. stored_material_documents ─────────────────────────────────────────
-- entry_id is NULL for the job-level COI. For a COI, pay_application_id is
-- the application it was first uploaded on ("reused from Pay app #N").
create table if not exists stored_material_documents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references organizations(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  entry_id            uuid references stored_material_entries(id) on delete cascade,
  job_id              uuid not null references jobs(id) on delete cascade,
  pay_application_id  uuid not null references pay_applications(id) on delete cascade,
  doc_type            text not null check (doc_type in ('photo', 'bill_of_sale', 'invoice', 'coi', 'storage_proof')),
  file_path           text not null,
  file_name           text not null,
  mime_type           text not null,
  file_size           integer not null default 0,
  coi_expiration_date date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  -- A COI is job-level (no entry); every other type belongs to an entry.
  constraint stored_material_documents_coi_shape check (
    (doc_type = 'coi' and entry_id is null) or (doc_type <> 'coi' and entry_id is not null)
  )
);

create index if not exists stored_material_documents_entry_idx
  on stored_material_documents (entry_id) where deleted_at is null;
create index if not exists stored_material_documents_job_idx
  on stored_material_documents (job_id, doc_type) where deleted_at is null;
create index if not exists stored_material_documents_pay_app_idx
  on stored_material_documents (pay_application_id) where deleted_at is null;

-- ── 3. RLS (same shape as 047; no DELETE policy = soft-delete only) ──────
alter table stored_material_entries   enable row level security;
alter table stored_material_documents enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['stored_material_entries', 'stored_material_documents'] loop
    execute format(
      'create policy %I on %I for select using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and is_org_member(organization_id)))',
      v_table || '_select_org_scoped', v_table
    );
    execute format(
      'create policy %I on %I for insert with check ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id)))',
      v_table || '_insert_org_scoped', v_table
    );
    execute format(
      'create policy %I on %I for update using ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id))) with check ((organization_id is null and user_id = auth.uid()) or (organization_id is not null and has_org_write_access(organization_id)))',
      v_table || '_update_org_scoped', v_table
    );
  end loop;
end $$;

-- ── 4. Verification — paste back the result ──────────────────────────────
-- Expect 3 policies (select/insert/update) for each of the two tables.
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
  and tablename in ('stored_material_entries', 'stored_material_documents')
group by tablename
order by tablename;
