import { Plan } from "@/lib/planLimits";

// Single source of truth for "what plan does this org effectively have,"
// shared by the client badge/gate hook and the server-side gate — grandfathered
// orgs (pre-existing accounts migrated before billing existed, plan left NULL
// by design — see supabase/054) are treated as Pro so nothing they could
// already do becomes newly blocked.
export function resolveEffectivePlan(plan: Plan | null, subscriptionStatus: string | null): Plan {
  if (subscriptionStatus === "grandfathered") return "pro";
  return plan === "pro" ? "pro" : "basic";
}
