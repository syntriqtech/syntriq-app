-- Add certified payroll flag to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS certified_payroll boolean NOT NULL DEFAULT false;
