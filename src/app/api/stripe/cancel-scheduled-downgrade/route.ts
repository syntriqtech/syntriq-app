import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { stripe } from "@/lib/stripe";

// Undoes a Pro Annual -> Basic Annual downgrade scheduled for renewal (see
// the schedule-based branch in create-checkout-session/route.ts). Releasing
// the schedule leaves the subscription exactly as it is today — still on
// the higher tier, still on its existing term — and just discards the
// future phase.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: organizationId, error: orgError } = await supabase.rpc("get_my_organization_id");
  if (orgError || !organizationId) {
    return NextResponse.json({ error: "Your account has no organization yet." }, { status: 400 });
  }

  const { data: org, error: fetchOrgError } = await supabase
    .from("organizations")
    .select("stripe_subscription_schedule_id")
    .eq("id", organizationId)
    .single();
  if (fetchOrgError) {
    return NextResponse.json({ error: fetchOrgError.message }, { status: 500 });
  }
  if (!org.stripe_subscription_schedule_id) {
    return NextResponse.json({ error: "There's no scheduled downgrade to cancel." }, { status: 400 });
  }

  await stripe.subscriptionSchedules.release(org.stripe_subscription_schedule_id);

  const serviceRoleSupabase = createServiceRoleClient();
  await serviceRoleSupabase
    .from("organizations")
    .update({ pending_plan: null, pending_plan_effective_at: null, stripe_subscription_schedule_id: null })
    .eq("id", organizationId);

  return NextResponse.json({ ok: true });
}
