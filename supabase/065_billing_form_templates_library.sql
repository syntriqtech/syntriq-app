-- Revises Custom Billing Forms (064) from "one template per org" to a named
-- library: an org can hold several templates (e.g. CTI's own billing form
-- AND a GC-specific form like 24/7 Concrete's COBE spreadsheet) and pick
-- which one to use per job on Download Package, instead of one org-wide
-- on/off switch. Additive on top of 064, which already ran in production
-- with a real row for California Tile Installers — that row keeps working
-- with no manual fix-up after this runs (name is backfilled below).

alter table billing_form_templates
  drop constraint billing_form_templates_organization_id_key;

alter table billing_form_templates
  add column name text;

update billing_form_templates
set name = coalesce(nullif(file_name, ''), 'Custom Billing Form')
where name is null;

alter table billing_form_templates
  alter column name set not null;

-- ── Verification ───────────────────────────────────────────────────────
select conname from pg_constraint
where conrelid = 'billing_form_templates'::regclass and conname = 'billing_form_templates_organization_id_key';
-- Expect 0 rows above (constraint dropped).

select id, organization_id, name, file_name, enabled from billing_form_templates order by created_at;
