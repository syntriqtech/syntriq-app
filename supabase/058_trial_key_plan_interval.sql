-- Path 2 (syntriqtech.com self-serve) trial keys previously only recorded
-- *that* payment was captured (requires_payment_method, stripe_customer_id)
-- but not *which* plan/interval the visitor picked on the landing page's
-- new Basic/Pro pricing toggle. Without these, /api/trial/provision has no
-- way to provision anything but a hardcoded Pro-monthly trial.
--
-- Defaults match the behavior every existing key already has (Path 1
-- word-of-mouth keys are always Pro monthly; every Path 2 key issued
-- before this migration was also always Pro monthly) — so this is a
-- backward-compatible addition, not a backfill.

alter table activation_keys
  add column if not exists plan             text not null default 'pro' check (plan in ('basic', 'pro')),
  add column if not exists billing_interval  text not null default 'monthly' check (billing_interval in ('monthly', 'annual'));

-- ── Verification ───────────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'activation_keys' and column_name in ('plan', 'billing_interval');
