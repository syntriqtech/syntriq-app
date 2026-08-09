-- Gates access to the app until the company profile's required fields are
-- filled in. "Required" here matches the company setup form itself
-- (company name, contact name, contact email are the only fields marked
-- `required` there — address/phone/country are optional).
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS company_setup_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any existing profile that already has those same three fields
-- filled in counts as already-completed, so this gate doesn't lock out
-- users who set up their company before this column existed.
UPDATE company_profile
SET company_setup_completed = true
WHERE company_setup_completed = false
  AND NULLIF(TRIM(company_name), '') IS NOT NULL
  AND NULLIF(TRIM(contact_name), '') IS NOT NULL
  AND NULLIF(TRIM(contact_email), '') IS NOT NULL;
