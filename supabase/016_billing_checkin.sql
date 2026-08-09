-- Part 1: Billing fields on jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS billing_due_day integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS billing_checkin_month text NOT NULL DEFAULT '';

-- Initialize check-in month to current month for existing active jobs
UPDATE jobs
  SET billing_checkin_month = to_char(now(), 'YYYY-MM')
  WHERE billing_checkin_month = ''
    AND deleted_at IS NULL
    AND archived_at IS NULL;

-- Part 2: Billing check-in responses (one per job per month)
CREATE TABLE IF NOT EXISTS billing_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  month text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('yes', 'no')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own billing checkins"
  ON billing_checkins FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enforce one decision per job per month
CREATE UNIQUE INDEX IF NOT EXISTS billing_checkins_job_month_idx
  ON billing_checkins(job_id, month);
