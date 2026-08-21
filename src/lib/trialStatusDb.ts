import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";

export type TrialStatus = {
  isTrialing: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
} | null;

// Reads organizations.subscription_status/current_period_end rather than
// the legacy per-user get_my_trial_status() (activation_keys.expires_at) —
// that value goes stale the moment a Path 2 trial (see
// src/app/api/trial/provision/route.ts) auto-converts to paid, since
// Stripe extends current_period_end to a real monthly cycle while the
// original key's expires_at stays frozen at the original 30-day mark.
// Reading the org directly keeps this correct for both trial paths and
// naturally stops showing once subscription_status leaves "trialing".
export async function fetchTrialStatus(): Promise<TrialStatus> {
  const ctx = await getCurrentUserContext();
  if (!ctx.organizationId) return null;

  const supabase = createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("subscription_status, current_period_end")
    .eq("id", ctx.organizationId)
    .single();
  if (error) throw new Error(error.message);

  const daysRemaining = org.current_period_end
    ? Math.ceil((new Date(org.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    isTrialing: org.subscription_status === "trialing",
    expiresAt: org.current_period_end,
    daysRemaining,
  };
}
