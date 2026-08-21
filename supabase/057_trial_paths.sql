-- Two distinct trial signup paths, both using the existing activation_keys
-- system (30-day, single-use trial keys, unchanged):
--
--   Path 1 (word-of-mouth): pre-generated key, no payment info ever
--   collected. At day 30, hard-locked exactly like today, nothing to
--   auto-charge.
--
--   Path 2 (syntriqtech.com self-serve): payment method captured via a
--   Stripe Setup Intent BEFORE a key is generated (see the new
--   syntriq-landing checkout flow). At day 30, Stripe auto-charges the
--   saved card for Pro monthly via a real trial-mode subscription.
--
-- redeem_activation_key() itself is UNCHANGED — it runs at signup, before
-- an organization exists (see chat/plan), so it can't provision billing.
-- Provisioning happens once an org exists, in
-- src/app/api/trial/provision/route.ts, which reads the columns added
-- here to tell the two paths apart.

-- ── 1. Path discriminator + Stripe linkage on activation_keys ───────────
alter table activation_keys
  add column if not exists requires_payment_method boolean not null default false,
  add column if not exists stripe_customer_id       text,
  add column if not exists recipient_email          text;

-- ── 2. Real-time trial expiry for Path 1 (no Stripe subscription to flip
--    status automatically at day 30) ──────────────────────────────────────
-- 'active'/'grandfathered' unchanged. 'trialing' now only counts as active
-- while current_period_end is still ahead (or unset) — enforced live on
-- every request via proxy.ts's existing has_active_subscription() call, so
-- Path 1's hard lock at day 30 needs no cron. Path 2 orgs have a real
-- Stripe subscription whose webhook already keeps current_period_end and
-- subscription_status in sync, so this is a no-op tightening for them —
-- it just adds a redundant same-moment safety net alongside the webhook.
create or replace function has_active_subscription()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = auth.uid()
      and (
        o.subscription_status in ('active', 'grandfathered')
        or (
          o.subscription_status = 'trialing'
          and (o.current_period_end is null or o.current_period_end > now())
        )
      )
  );
$$;

grant execute on function has_active_subscription() to authenticated;

-- ── Verification ───────────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'activation_keys' and column_name in ('requires_payment_method', 'stripe_customer_id', 'recipient_email');

select proname from pg_proc where proname = 'has_active_subscription';
