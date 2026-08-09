-- Add signature storage to user_profiles.
-- Stored as a base64 PNG data URL — signatures are small (~20-50 KB).
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS signature_data TEXT NOT NULL DEFAULT '';
