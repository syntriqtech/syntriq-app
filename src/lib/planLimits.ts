export type Plan = "basic" | "pro";
export type BillingInterval = "monthly" | "annual";

export type PlanLimits = {
  maxMembers: number;
  maxActiveJobs: number | null; // null = unlimited
  priceLabel: string;
};

// Kept in sync by hand with the hardcoded limits inside
// add_organization_member() (supabase/054_subscription_billing.sql) — flagging
// the duplication rather than hiding it behind a single "source of truth"
// that would need a network round trip just to read a constant.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  basic: { maxMembers: 2, maxActiveJobs: 10, priceLabel: "$99/mo" },
  pro: { maxMembers: 6, maxActiveJobs: null, priceLabel: "$179/mo" },
};

// Annual prices are ~20% off 12x the monthly price, rounded to whole
// dollars on the monthly-equivalent (not the raw 20%-off cents amount) so
// neither number carries a decimal — the exact discount lands at ~20.1-20.2%
// rather than precisely 20%, which is why ANNUAL_DISCOUNT_LABEL below stays
// a fixed "Save 20%" string instead of being computed. These must match the
// amounts the two annual Stripe Prices were created with (see .env.local
// STRIPE_PRICE_*_ANNUAL).
export const PLAN_ANNUAL_PRICING: Record<Plan, { priceLabel: string; monthlyEquivalentLabel: string }> = {
  basic: { priceLabel: "$948/yr", monthlyEquivalentLabel: "$79/mo" },
  pro: { priceLabel: "$1,716/yr", monthlyEquivalentLabel: "$143/mo" },
};

export const ANNUAL_DISCOUNT_LABEL = "Save 20%";
