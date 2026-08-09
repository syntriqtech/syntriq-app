-- Lookup table for user-defined billing platforms (custom entries only — presets live in app code)
CREATE TABLE IF NOT EXISTS billing_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE billing_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own billing platforms"
  ON billing_platforms FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Billing platform selected for a specific job
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS billing_platform text NOT NULL DEFAULT '';
