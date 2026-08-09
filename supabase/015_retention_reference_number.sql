-- Add optional reference number to retention payments (check number, wire ref, etc.)
ALTER TABLE retention_releases
  ADD COLUMN IF NOT EXISTS payment_reference text NOT NULL DEFAULT '';
