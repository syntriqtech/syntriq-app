-- Adds 30-day trial keys alongside the existing standard activation keys.
--
-- Trial keys reuse the existing single-use machinery (uses_count/max_uses/
-- is_used) rather than adding a duplicate "used" flag — a trial key with
-- max_uses = 1 (the default, and the only value trial keys are allowed to
-- have, enforced below) already can't be redeemed twice.
--
-- The 30-day clock starts at REDEMPTION (signup), not at key generation, so
-- redeemed_at/expires_at are only ever set inside redeem_activation_key(),
-- the same SECURITY DEFINER function that already handles redemption.

ALTER TABLE activation_keys
  ADD COLUMN key_type TEXT NOT NULL DEFAULT 'standard' CHECK (key_type IN ('trial', 'standard')),
  ADD COLUMN trial_duration_days INTEGER DEFAULT 30,
  ADD COLUMN redeemed_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ;

-- Reusable/multi-use trial keys are explicitly not wanted — guard the data,
-- not just the redemption code path, in case a key is ever inserted by hand.
ALTER TABLE activation_keys
  ADD CONSTRAINT activation_keys_trial_single_use_chk
  CHECK (key_type <> 'trial' OR max_uses = 1);

-- The trial-lock check below runs on every authenticated request (see
-- is_trial_expired()), so used_by needs an index or that becomes a seq scan
-- on every page load.
CREATE INDEX activation_keys_used_by_idx ON activation_keys (used_by) WHERE used_by IS NOT NULL;

-- Same redemption logic as before, now also stamping redeemed_at/expires_at.
-- expires_at is only computed for trial keys; standard keys keep it NULL
-- (no expiration).
CREATE OR REPLACE FUNCTION redeem_activation_key(p_key_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_new_count INTEGER;
  v_max INTEGER;
  v_key_type TEXT;
  v_trial_duration_days INTEGER;
  v_redeemed_at TIMESTAMPTZ := NOW();
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT id, uses_count + 1, max_uses, key_type, trial_duration_days
  INTO v_id, v_new_count, v_max, v_key_type, v_trial_duration_days
  FROM activation_keys
  WHERE UPPER(key_code) = UPPER(TRIM(p_key_code))
    AND uses_count < max_uses
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_key_type = 'trial' THEN
    v_expires_at := v_redeemed_at + (COALESCE(v_trial_duration_days, 30) || ' days')::INTERVAL;
  END IF;

  UPDATE activation_keys
  SET uses_count = v_new_count,
      is_used = (v_new_count >= v_max),
      used_by = auth.uid(),
      used_at = NOW(),
      redeemed_at = v_redeemed_at,
      expires_at = v_expires_at
  WHERE id = v_id;

  INSERT INTO activation_key_redemptions (activation_key_id, user_id)
  VALUES (v_id, auth.uid());

  RETURN TRUE;
END;
$$;

-- Tells the proxy (src/proxy.ts) whether the signed-in user's trial has
-- expired, without granting it (or the client) direct table access. Only
-- ever true for a user who redeemed a trial key whose expires_at has
-- passed; standard-key users and never-expiring keys are unaffected.
CREATE OR REPLACE FUNCTION is_trial_expired()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM activation_keys
    WHERE used_by = auth.uid()
      AND key_type = 'trial'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION is_trial_expired() TO authenticated;
