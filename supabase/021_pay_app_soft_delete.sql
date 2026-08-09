-- Add soft-delete support to pay_applications
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
