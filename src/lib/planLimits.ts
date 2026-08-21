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

// Annual prices are a flat 20% off 12x the monthly price. Kept as plain
// numbers (not derived from PLAN_LIMITS.priceLabel) so display strings stay
// simple — these must match the amounts the two annual Stripe Prices were
// created with (see .env.local STRIPE_PRICE_*_ANNUAL).
export const PLAN_ANNUAL_PRICING: Record<Plan, { priceLabel: string; monthlyEquivalentLabel: string }> = {
  basic: { priceLabel: "$950.40/yr", monthlyEquivalentLabel: "$79.20/mo" },
  pro: { priceLabel: "$1,718.40/yr", monthlyEquivalentLabel: "$143.20/mo" },
};

export const ANNUAL_DISCOUNT_LABEL = "Save 20%";
