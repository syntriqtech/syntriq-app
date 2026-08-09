-- Activation keys gate account creation. Each key can be redeemed up to
-- max_uses times (default 1 = single-use, so handing one key to a whole
-- crew is just a matter of setting max_uses higher when you create it).
--
-- No RLS SELECT policy is granted here on purpose: a plain "anyone can
-- read" policy would let any anonymous visitor list every activation code
-- straight from the API, defeating the point of the gate. Instead, the two
-- functions below run as SECURITY DEFINER so the signup page can check and
-- redeem a key without ever getting table access.

CREATE TABLE activation_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code    TEXT NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  uses_count  INTEGER NOT NULL DEFAULT 0,
  is_used     BOOLEAN NOT NULL DEFAULT FALSE,
  used_by     UUID REFERENCES auth.users(id),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT
);

-- Case-insensitive uniqueness so "ABC-123" and "abc-123" can't both be
-- inserted by mistake when typing keys in by hand.
CREATE UNIQUE INDEX activation_keys_key_code_upper_idx ON activation_keys (UPPER(key_code));

ALTER TABLE activation_keys ENABLE ROW LEVEL SECURITY;

-- Returns whether a key is currently redeemable, without exposing the table.
CREATE OR REPLACE FUNCTION check_activation_key(p_key_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM activation_keys
    WHERE UPPER(key_code) = UPPER(TRIM(p_key_code))
      AND uses_count < max_uses
  );
$$;

GRANT EXECUTE ON FUNCTION check_activation_key(TEXT) TO anon, authenticated;

-- Atomically redeems a key for the calling (already-authenticated) user.
-- Returns true if redeemed, false if the key doesn't exist or is exhausted.
-- Uses auth.uid() rather than a passed-in user id so a client can't redeem
-- a key on someone else's behalf.
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

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_activation_key(TEXT) TO authenticated;

-- Optional convenience for generating hard-to-guess codes by hand in the
-- Supabase SQL editor, e.g.:
--   INSERT INTO activation_keys (key_code, notes)
--   VALUES (generate_activation_key_code(), 'For Jane at ABC Tile');
CREATE OR REPLACE FUNCTION generate_activation_key_code()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' ||
         upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' ||
         upper(substr(md5(gen_random_uuid()::text), 1, 4));
$$;
