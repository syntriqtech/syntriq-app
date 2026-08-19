-- Step 1 of the multi-user migration: schema only. No RLS policy changes,
-- no auth/session changes, no UI changes — those are later steps.
--
-- Adds an organization layer: `organizations` (the company-level record)
-- and `organization_members` (who belongs to which org, with what role).
-- Then adds a nullable `organization_id` column to every table that holds
-- per-company business data, so a later backfill + cutover can happen
-- without a big-bang rewrite.
--
-- Tables intentionally left untouched (see chat discussion for the full
-- reasoning):
--   - `payments` (migration 002) — dead/superseded by pay_app_payments,
--     not part of this migration's scope.
--   - `sidebar_prefs`, `user_profiles` — personal to the individual, not
--     company data.
--   - `activation_keys`, `activation_key_redemptions` — signup/trial
--     gating, not tenant business data.

-- ── 1. organizations ─────────────────────────────────────────────────────
-- Only `name` was asked for. Adding `updated_at` for consistency with every
-- other table in this schema (flagging since it wasn't explicitly asked
-- for). Deliberately NOT adding plan/status/slug columns — that's Billing &
-- Plan territory, a separate future step.
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS enabled with zero policies, matching how every other table in this
-- codebase pairs CREATE TABLE with RLS enable. This doesn't block anything
-- today (nothing in the app queries these tables yet, and the SQL-editor
-- connection is service_role, which bypasses RLS regardless). Real policies
-- are a later step.
alter table organizations enable row level security;

-- ── 2. organization_members ──────────────────────────────────────────────
-- No invite/permissions UI here — just the table, as asked. UNIQUE(org,
-- user) added since a user shouldn't have two membership rows in the same
-- org (flagging since it wasn't explicitly asked for, but seemed necessary
-- to avoid ambiguous duplicate memberships).
create table if not exists organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner', 'project_manager', 'project_accountant', 'read_only')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table organization_members enable row level security;

create index if not exists organization_members_org_id_idx  on organization_members(organization_id);
create index if not exists organization_members_user_id_idx on organization_members(user_id);

-- ── 3. organization_id on every organization-scoped table ───────────────
-- Nullable for now — no cutover yet. ON DELETE SET NULL rather than CASCADE:
-- deleting an org shouldn't silently cascade-delete years of pay app/job
-- history. That default can be revisited when the column becomes required.
-- Each also gets an index since this will become the primary scoping
-- column once RLS is rewritten.

alter table jobs                          add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table sov_line_items                add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table pay_applications              add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table pay_app_payments              add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table change_orders                 add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table retention_releases            add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table billing_checkins              add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table lien_waivers                  add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table general_contractors           add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table pay_application_certifications add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table company_profile               add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table billing_platforms             add column if not exists organization_id uuid references organizations(id) on delete set null;

create index if not exists jobs_organization_id_idx                          on jobs(organization_id);
create index if not exists sov_line_items_organization_id_idx                on sov_line_items(organization_id);
create index if not exists pay_applications_organization_id_idx              on pay_applications(organization_id);
create index if not exists pay_app_payments_organization_id_idx              on pay_app_payments(organization_id);
create index if not exists change_orders_organization_id_idx                 on change_orders(organization_id);
create index if not exists retention_releases_organization_id_idx            on retention_releases(organization_id);
create index if not exists billing_checkins_organization_id_idx              on billing_checkins(organization_id);
create index if not exists lien_waivers_organization_id_idx                  on lien_waivers(organization_id);
create index if not exists general_contractors_organization_id_idx           on general_contractors(organization_id);
create index if not exists pay_application_certifications_organization_id_idx on pay_application_certifications(organization_id);
create index if not exists company_profile_organization_id_idx               on company_profile(organization_id);
create index if not exists billing_platforms_organization_id_idx             on billing_platforms(organization_id);
