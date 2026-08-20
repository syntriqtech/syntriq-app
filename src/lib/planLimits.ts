export type Plan = "basic" | "pro";

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
