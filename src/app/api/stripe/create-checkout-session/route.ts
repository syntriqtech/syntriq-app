import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
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
    .select("stripe_customer_id, stripe_subscription_id, plan, subscription_status")
    .eq("id", organizationId)
    .single();
  if (fetchOrgError) {
    return NextResponse.json({ error: fetchOrgError.message }, { status: 500 });
  }

  // Block a downgrade to Basic (2-member cap) before ever touching Stripe —
  // supabase/055_member_seat_caps.sql enforces this same rule at the database
  // level too, but that trigger only fires after Stripe has already been
  // charged/changed. Checking here means a mismatch between Stripe and
  // Supabase can't happen on this path at all.
  if (plan === "basic") {
    const { count: memberCount } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if ((memberCount ?? 0) > 2) {
      return NextResponse.json(
        {
          error: `Cannot switch to Basic: this organization has ${memberCount} team members, which is over Basic's limit of 2. Remove members down to 2 or fewer first.`,
        },
        { status: 400 }
      );
    }
  }

  // Plan change on an already-live subscription (e.g. Basic -> Pro from the
  // upgrade prompt) — swap the existing subscription's price instead of
  // opening a new Checkout Session, which would create a SECOND concurrent
  // subscription for the same customer and double-bill them. Only
  // 'trialing'/'active' count as "live"; anything else (past_due, canceled,
  // incomplete...) falls through to a fresh Checkout Session below.
  if (
    org.stripe_subscription_id &&
    (org.subscription_status === "trialing" || org.subscription_status === "active")
  ) {
    if (org.plan === plan) {
      return NextResponse.json({ url: `${req.nextUrl.origin}/billing-plan` });
    }

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json({ error: "Could not find your subscription item." }, { status: 500 });
    }

    const updated = await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: itemId, price: PRICE_IDS[plan] }],
      proration_behavior: "create_prorations",
    });

    // Write the new plan back immediately with the service-role client — the
    // authenticated client can't (organizations_update_owner_only restricts
    // updates to owners, and any org member can trigger an upgrade) — rather
    // than waiting on the customer.subscription.updated webhook, which will
    // still fire and just redundantly write the same values.
    const serviceRoleSupabase = createServiceRoleClient();
    await serviceRoleSupabase
      .from("organizations")
      .update({
        plan,
        subscription_status: updated.status,
        current_period_end: new Date(updated.items.data[0].current_period_end * 1000).toISOString(),
      })
      .eq("id", organizationId);

    return NextResponse.json({ url: `${req.nextUrl.origin}/billing-plan` });
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
