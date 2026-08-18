-- Read-only view for looking up which activation key each user redeemed and
-- when it expires (if it's a trial). Meant to be queried by hand from the
-- Supabase SQL editor or Table Editor ("Views" tab) — not exposed to the
-- app. No GRANTs are added on purpose, same reasoning as activation_keys
-- itself: this joins auth.users, so it should only ever be reachable by the
-- postgres/service_role connection the SQL editor uses, never anon or
-- authenticated.

CREATE OR REPLACE VIEW user_activation_status AS
SELECT
  u.id AS user_id,
  u.email,
  ak.key_code,
  ak.key_type,
  ak.redeemed_at,
  ak.expires_at,
  (ak.key_type = 'trial' AND ak.expires_at IS NOT NULL AND ak.expires_at < NOW()) AS trial_expired
FROM auth.users u
LEFT JOIN activation_keys ak ON ak.used_by = u.id
ORDER BY u.email;
