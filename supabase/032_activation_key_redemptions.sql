-- Per-redemption audit trail for multi-use activation keys. The columns on
-- activation_keys (is_used/used_by/used_at/uses_count) stay as a quick
-- single-glance status and are NOT replaced — they only ever reflect the
-- most recent redemption. This table keeps a full history of every user who
-- redeemed a given key, for when a "who used this key" view is built.

CREATE TABLE activation_key_redemptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_key_id   UUID NOT NULL REFERENCES activation_keys(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  redeemed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE activation_key_redemptions ENABLE ROW LEVEL SECURITY;
-- No policies granted — same reasoning as activation_keys itself. Only
-- redeem_activation_key() (SECURITY DEFINER) writes to this table for now;
-- a future admin-only read function/view can be added when a UI needs it.

-- Same as before, but now also logs the redemption to
-- activation_key_redemptions for a full audit trail on multi-use keys.
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
BEGIN
  SELECT id, uses_count + 1, max_uses INTO v_id, v_new_count, v_max
  FROM activation_keys
  WHERE UPPER(key_code) = UPPER(TRIM(p_key_code))
    AND uses_count < max_uses
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE activation_keys
  SET uses_count = v_new_count,
      is_used = (v_new_count >= v_max),
      used_by = auth.uid(),
      used_at = NOW()
  WHERE id = v_id;

  INSERT INTO activation_key_redemptions (activation_key_id, user_id)
  VALUES (v_id, auth.uid());

  RETURN TRUE;
END;
$$;
