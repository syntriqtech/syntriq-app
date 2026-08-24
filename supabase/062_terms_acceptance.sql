-- Records ToS consent captured at signup (both the self-serve and
-- invited-teammate paths write this in the same insert as the profile row —
-- see createUserProfileFromSignup in src/lib/userProfileDb.ts). NULL for
-- anyone who signed up before this migration. No re-consent flow yet if the
-- Terms text/version changes later — known gap, tracked separately.
alter table user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- ── Verification ───────────────────────────────────────────────────────
select column_name, data_type
from information_schema.columns
where table_name = 'user_profiles' and column_name in ('terms_accepted_at', 'terms_version');
