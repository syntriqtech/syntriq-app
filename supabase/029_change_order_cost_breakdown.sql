-- Optional cost breakdown for a change order, captured when a source document
-- (e.g. a Clearstory COR export) itemizes cost by category. Nullable — most
-- change orders (manual entry) will never set these, only `amount` is used
-- for billing math everywhere else in the app.

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS materials_amount numeric,
  ADD COLUMN IF NOT EXISTS labor_amount     numeric,
  ADD COLUMN IF NOT EXISTS markup_amount    numeric;
