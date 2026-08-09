-- Capture first/last name separately (collected at signup) alongside the
-- existing full_name, which stays as-is since PDF signer lines and Account
-- Settings already read from it.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
