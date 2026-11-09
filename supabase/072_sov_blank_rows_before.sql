-- "Skip rows" for printed billing forms.
--
-- Run this in the Supabase Dashboard SQL Editor BEFORE deploying the code
-- that uses it.
--
-- Adds one column to sov_line_items: how many blank rows to leave above this
-- line when it is printed on a customer's own billing form (e.g. California
-- Tile Installers' double-spaced Schedule of Values). Default 0 = no gap, so
-- every existing line prints exactly as it does today.
alter table sov_line_items
  add column if not exists blank_rows_before integer not null default 0
  check (blank_rows_before >= 0 and blank_rows_before <= 10);

-- Verification: should return one row, integer, default 0.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'sov_line_items'
  and column_name = 'blank_rows_before';
