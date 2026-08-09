-- Stores per-user sidebar tab order and hidden tabs.
-- tab_order: array of href strings in the user's preferred order (empty = use app default)
-- hidden_tabs: array of hrefs the user has hidden from the sidebar

CREATE TABLE sidebar_prefs (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tab_order  TEXT[] NOT NULL DEFAULT '{}',
  hidden_tabs TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sidebar_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sidebar prefs"
  ON sidebar_prefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sidebar prefs"
  ON sidebar_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sidebar prefs"
  ON sidebar_prefs FOR UPDATE
  USING (auth.uid() = user_id);
