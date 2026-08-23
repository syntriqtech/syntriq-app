-- Adds personal email/phone to user_profiles, alongside the existing
-- full_name/role_title — each person's own contact info, separate from
-- company_profile (which is company-wide and owner-only as of migration
-- 060). No RLS changes needed: the existing "auth.uid() = user_id"
-- policies (migration 024) already cover any new column on this table.

alter table user_profiles
  add column if not exists email text not null default '',
  add column if not exists phone text not null default '';

-- ── Verification ───────────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'user_profiles' and column_name in ('email', 'phone');
