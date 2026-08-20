import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
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
    .select("stripe_customer_id")
    .eq("id", organizationId)
    .single();
  if (fetchOrgError || !org.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found for your organization yet." }, { status: 400 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${req.nextUrl.origin}/billing-plan`,
  });

  return NextResponse.json({ url: portalSession.url });
}
