-- Lets a signed-in user check their own trial status (for a "N days left"
-- indicator in the sidebar) without exposing the activation_keys table
-- directly. Same SECURITY DEFINER pattern as is_trial_expired() — scoped to
-- auth.uid(), returns only key_type/expires_at, nothing else on the row
-- (no key_code, no other users' keys).

CREATE OR REPLACE FUNCTION get_my_trial_status()
RETURNS TABLE(key_type TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT key_type, expires_at
  FROM activation_keys
  WHERE used_by = auth.uid()
  ORDER BY redeemed_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_my_trial_status() TO authenticated;
