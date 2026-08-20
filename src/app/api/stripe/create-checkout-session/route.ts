import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { Plan } from "@/lib/planLimits";

const PRICE_IDS: Record<Plan, string> = {
  basic: process.env.STRIPE_PRICE_BASIC!,
  pro: process.env.STRIPE_PRICE_PRO!,
};

export async function POST(req: NextRequest) {
  const { plan } = (await req.json()) as { plan?: Plan };
  if (plan !== "basic" && plan !== "pro") {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

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
  if (fetchOrgError) {
    return NextResponse.json({ error: fetchOrgError.message }, { status: 500 });
  }

  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { organization_id: organizationId },
    });
    customerId = customer.id;
    await supabase.from("organizations").update({ stripe_customer_id: customerId }).eq("id", organizationId);
  }

  const origin = req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // No payment_method_types — Stripe determines eligible methods dynamically.
    line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
    subscription_data: {
      trial_period_days: 30,
      metadata: { organization_id: organizationId, plan },
    },
    success_url: `${origin}/billing-plan?checkout=success`,
    cancel_url: `${origin}/choose-plan`,
  });

  return NextResponse.json({ url: session.url });
}
