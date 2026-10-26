-- GC Library: a platform-level (not org-scoped) directory of GC/customer
-- profiles the Syntriq team maintains once and can "enable" (copy) into any
-- organization's own general_contractors list, instead of re-typing the
-- same GC's billing address, payment terms, retention %, and PM contact
-- info by hand for every new account that bills that GC. Admin-only — same
-- RLS shape as `organizations` (enabled, zero policies): nothing in the app
-- queries this directly, every read/write goes through the admin API
-- routes, which are gated server-side to ADMIN_EMAILS and use the
-- service-role client (bypasses RLS regardless).

create table if not exists gc_library (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  billing_address       text not null default '',
  payment_terms         text not null default '',
  default_retention_pct numeric,
  billing_platform      text not null default '',
  phone                 text not null default '',
  fax                   text not null default '',
  pm_name               text not null default '',
  pm_email              text not null default '',
  pm_mobile             text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table gc_library enable row level security;

-- ── Verification ───────────────────────────────────────────────────────
select column_name from information_schema.columns where table_name = 'gc_library' order by ordinal_position;
