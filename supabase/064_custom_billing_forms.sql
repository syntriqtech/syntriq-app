-- Custom Billing Forms: lets one organization (first real case: California
-- Tile Installers) fill its own Excel billing workbook with Syntriq data
-- instead of the shared default PDF pipeline. Off by default for every
-- org — nothing changes for anyone who doesn't opt in.
--
-- Three additive pieces:
--   1. New job-level fields the real workbook needs that Syntriq doesn't
--      track today (PO Number, OH&P %, and the CO retention % pair).
--   2. New GC contact fields the real workbook needs (phone/fax/PM info).
--   3. billing_form_templates: one row per org, storing the uploaded
--      template file's path + its cell-mapping JSON, mirroring the
--      company_profile pattern from 060 (org-scoped reads, owner-only
--      writes) exactly.

-- ── 1. New job fields ─────────────────────────────────────────────────────
-- All nullable — existing jobs are unaffected. Stored the same way
-- retention_rate_cw already is (e.g. 10 means 10%, divided by 100 at use).
alter table jobs
  add column if not exists po_number                      text,
  add column if not exists oh_and_p_pct                    numeric,
  add column if not exists co_retention_pct                numeric,
  add column if not exists co_retention_pct_previous       numeric,
  add column if not exists contract_retention_pct_previous numeric;

-- ── 2. New GC contact fields ──────────────────────────────────────────────
alter table general_contractors
  add column if not exists phone    text,
  add column if not exists fax      text,
  add column if not exists pm_name  text,
  add column if not exists pm_email text,
  add column if not exists pm_mobile text;

-- ── 3. billing_form_templates ─────────────────────────────────────────────
-- field_mapping is null until hand-configured (see chat/plan — there's no
-- mapping-builder UI; a real org's mapping is set with a one-off SQL update,
-- same pattern activation_keys already uses for one-off admin setup). The
-- "enabled" toggle is meant to be locked in the UI until both file_path and
-- field_mapping are present, so this table intentionally allows the
-- half-configured state (file uploaded, no mapping yet) rather than
-- enforcing it at the DB level — a single-org, hand-operated setup step
-- doesn't need constraint machinery for that.
create table if not exists billing_form_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade unique,
  enabled         boolean not null default false,
  file_path       text,
  file_name       text,
  field_mapping   jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table billing_form_templates enable row level security;

create policy "billing_form_templates_select_org_scoped"
  on billing_form_templates for select
  using (is_org_member(organization_id));

create policy "billing_form_templates_insert_owner_only"
  on billing_form_templates for insert
  with check (is_org_owner(organization_id));

create policy "billing_form_templates_update_owner_only"
  on billing_form_templates for update
  using (is_org_owner(organization_id))
  with check (is_org_owner(organization_id));

create policy "billing_form_templates_delete_owner_only"
  on billing_form_templates for delete
  using (is_org_owner(organization_id));

-- ── 4. Storage bucket for the uploaded template files ────────────────────
-- Public, same shape as company-logos (020 + 060) — path is
-- '{organizationId}/<filename>', write restricted to that org's owner.
insert into storage.buckets (id, name, public)
values ('billing-form-templates', 'billing-form-templates', true)
on conflict (id) do nothing;

create policy "Org owners manage their billing form templates"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'billing-form-templates' and is_org_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'billing-form-templates' and is_org_owner(((storage.foldername(name))[1])::uuid));

-- ── Verification ───────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_name = 'jobs' and column_name in (
  'po_number', 'oh_and_p_pct', 'co_retention_pct', 'co_retention_pct_previous', 'contract_retention_pct_previous'
);

select column_name from information_schema.columns
where table_name = 'general_contractors' and column_name in ('phone', 'fax', 'pm_name', 'pm_email', 'pm_mobile');

select policyname from pg_policies where schemaname = 'public' and tablename = 'billing_form_templates';

select id, public from storage.buckets where id = 'billing-form-templates';
