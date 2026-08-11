-- Deleting a Supabase auth user was failing with a foreign-key violation
-- whenever that user had redeemed an activation key, since used_by/user_id
-- referenced auth.users(id) with the default RESTRICT behavior. Switch both
-- to ON DELETE SET NULL so deleting a user just clears "who redeemed this"
-- instead of blocking the delete — the key's uses_count/is_used status and
-- the redemption row itself (with its timestamp) are preserved either way.

ALTER TABLE activation_keys
  DROP CONSTRAINT activation_keys_used_by_fkey,
  ADD CONSTRAINT activation_keys_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE activation_key_redemptions
  DROP CONSTRAINT activation_key_redemptions_user_id_fkey,
  ADD CONSTRAINT activation_key_redemptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- user_id was NOT NULL on the redemptions table; it can now legitimately
-- become null after a user delete, so relax that constraint.
ALTER TABLE activation_key_redemptions
  ALTER COLUMN user_id DROP NOT NULL;
