import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveEffectivePlan } from "@/lib/orgPlan";

type ProGateResult =
  | { ok: true; user: User; organizationId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: 401 | 400 | 500 | 403; message: string };

// Shared backend gate for Pro-only features (e.g. AI import) — the UI-side
// hide/disable in usePlan() is a convenience, not the enforcement; this is
// what actually stops a non-Pro org member from calling the underlying route
// directly. Callers build their own NextResponse from the failure shape
// since each route has its own JSON response contract.
export async function requireProPlan(): Promise<ProGateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: "Not signed in." };
  }

  const { data: organizationId, error: orgError } = await supabase.rpc("get_my_organization_id");
  if (orgError || !organizationId) {
    return { ok: false, status: 400, message: "Your account has no organization yet." };
  }

  const { data: org, error: fetchError } = await supabase
    .from("organizations")
    .select("plan, subscription_status")
    .eq("id", organizationId)
    .single();
  if (fetchError || !org) {
    return { ok: false, status: 500, message: "Could not verify your plan." };
  }

  const effectivePlan = resolveEffectivePlan(org.plan, org.subscription_status);
  if (effectivePlan !== "pro") {
    return { ok: false, status: 403, message: "This feature requires the Pro plan." };
  }

  return { ok: true, user, organizationId, supabase };
}
