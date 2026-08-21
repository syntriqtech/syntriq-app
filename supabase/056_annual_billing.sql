-- Annual billing: adds a billing_interval alongside plan, term start/end
-- tracking, and columns for a downgrade scheduled to take effect at an
-- annual term's renewal (Pro Annual -> Basic Annual can't happen mid-term,
-- so it's recorded here and applied by Stripe via a subscription schedule,
-- not by us). See src/app/api/stripe/create-checkout-session/route.ts and
-- src/app/api/stripe/cancel-scheduled-downgrade/route.ts.

-- ── 1. New columns on organizations ──────────────────────────────────────
alter table organizations
  add column if not exists billing_interval          text check (billing_interval in ('monthly', 'annual')),
  add column if not exists current_term_start         timestamptz,
  add column if not exists pending_plan               text check (pending_plan in ('basic', 'pro')),
  add column if not exists pending_plan_effective_at  timestamptz,
  add column if not exists stripe_subscription_schedule_id text;

-- Every org with a plan today only ever went through a monthly Checkout
-- Session (annual didn't exist yet) — backfill accordingly.
update organizations
set billing_interval = 'monthly'
where plan is not null and billing_interval is null;

-- ── 2. Queryable view for the manual annual-signup follow-up ────────────
-- Not automated on purpose (see chat) — just makes "who bought annual and
-- when" a one-line query instead of hand-filtering the organizations table.
create or replace view annual_billing_signups as
select
  o.id as organization_id,
  o.name,
  o.plan,
  o.subscription_status,
  o.current_term_start,
  o.current_period_end as current_term_end,
  o.pending_plan,
  o.pending_plan_effective_at
from organizations o
where o.billing_interval = 'annual'
order by o.current_term_start desc nulls last;

-- ── Verification ───────────────────────────────────────────────────────
select id, name, plan, billing_interval, current_term_start, current_period_end
from organizations
order by created_at;

select * from annual_billing_signups;
