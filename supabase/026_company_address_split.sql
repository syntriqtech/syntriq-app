-- Add structured address fields to company_profile.
-- company_address is kept and will be kept in sync (composed from parts) so
-- existing PDF code that reads company_address continues to work.

ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS company_street  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_city    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_state   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_zip     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_country TEXT NOT NULL DEFAULT 'USA';
