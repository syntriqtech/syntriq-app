-- GC/Customer records: a persistent, reusable directory of general contractors
-- so their info doesn't get re-typed on every job. Jobs keep their existing
-- free-text `customer` column for backward compatibility (and because PDFs /
-- dashboards read it directly) — gc_id is an additive link for new jobs.

CREATE TABLE IF NOT EXISTS general_contractors (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  billing_address       text NOT NULL DEFAULT '',
  payment_terms         text NOT NULL DEFAULT '',
  default_retention_pct numeric,
  billing_platform      text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE general_contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own GC records"
  ON general_contractors FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS general_contractors_user_id_idx ON general_contractors(user_id);

-- Link jobs to a GC record. Nullable — existing jobs predate this table and
-- are not backfilled (that's a separate, deliberate cleanup task). New jobs
-- are required (at the app layer) to set this going forward.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS gc_id uuid REFERENCES general_contractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT '';
