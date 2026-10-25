import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isAdminEmail } from "@/lib/adminEmails";

const VALID_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
  "grandfathered",
];

// Platform admin only: lets the Syntriq team manually extend/change a
// company's trial or subscription status without going into Supabase.
// Bypasses RLS on purpose (service role) — this edits another org's row,
// which no normal user or org owner is allowed to do.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { organizationId, subscriptionStatus, currentPeriodEnd } = await req.json().catch(() => ({}));

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }
  if (subscriptionStatus && !VALID_STATUSES.includes(subscriptionStatus)) {
    return NextResponse.json({ error: "Invalid subscription status." }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  if (subscriptionStatus !== undefined) update.subscription_status = subscriptionStatus;
  if (currentPeriodEnd !== undefined) update.current_period_end = currentPeriodEnd;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("organizations")
    .update(update)
    .eq("id", organizationId)
    .select("id, name, subscription_status, current_period_end")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ organization: data });
}
