-- Run this in the Supabase Dashboard SQL Editor.
-- Persists the retention release's "Released Through" date (the period the
-- release covers, distinct from release_date — the date the release was
-- billed). Previously this only existed in the Retention Release Wizard's
-- in-memory state at billing time, used to build that session's PDF, then
-- lost once the wizard closed. Regenerating a release's invoice/waiver PDF
-- later (from the Retention page, after this migration) needs a real value
-- to show, so it's now stored on the release record itself.

alter table retention_releases
  add column if not exists released_through date;
