import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { stripe } from "@/lib/stripe";
import { Plan, BillingInterval } from "@/lib/planLimits";

// Same price map as src/app/api/stripe/create-checkout-session/route.ts —
// duplicated rather than imported from there since that route's map is a
// local const, not an exported one, and the two call sites have different
// enough surrounding logic (one-time subscription create vs. ongoing
// plan-change) that sharing more than the map itself isn't a clean fit.
const PRICE_IDS: Record<Plan, Record<BillingInterval, string>> = {
  basic: {
    monthly: process.env.STRIPE_PRICE_BASIC!,
    annual: process.env.STRIPE_PRICE_BASIC_ANNUAL!,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO!,
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL!,
  },
};

// Called once, right after bootstrap_organization() creates a brand-new
// org (see src/lib/companyProfileDb.ts) — redeem_activation_key() itself
// runs at signup, before any organization exists, so it can't write
// billing fields. This is where a redeemed trial key actually turns into
// organization billing state. No-ops (not an error) if the org is already
// provisioned or the user never redeemed a trial key at all — both are
// normal, expected cases, not failures.
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

  const serviceRoleSupabase = createServiceRoleClient();

  const { data: org, error: fetchOrgError } = await serviceRoleSupabase
    .from("organizations")
    .select("plan")
    .eq("id", organizationId)
    .single();
  if (fetchOrgError) {
    return NextResponse.json({ error: fetchOrgError.message }, { status: 500 });
  }

  // Idempotent — an org that already has a plan (a previous call to this
  // route, or a normal Stripe checkout) is never touched again here.
  if (org.plan) {
    return NextResponse.json({ ok: true, provisioned: false });
  }

  const { data: key } = await serviceRoleSupabase
    .from("activation_keys")
    .select("requires_payment_method, stripe_customer_id, redeemed_at, expires_at, plan, billing_interval")
    .eq("used_by", user.id)
    .eq("key_type", "trial")
    .order("redeemed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No trial key redeemed by this user — nothing to provision here; they
  // go through /choose-plan like a normal signup.
  if (!key) {
    return NextResponse.json({ ok: true, provisioned: false });
  }

  // supabase/058 defaults both columns to 'pro'/'monthly', so this also
  // covers every key issued before that migration (Path 1 keys are always
  // Pro monthly anyway).
  const plan = key.plan as Plan;
  const billingInterval = key.billing_interval as BillingInterval;

  if (!key.requires_payment_method) {
    // Path 1 (word-of-mouth): no payment method was ever collected, so
    // there's no Stripe object to create — just a plain trial term. Its
    // expiry is enforced live by has_active_subscription() (supabase/057)
    // reading current_period_end, no Stripe subscription/webhook involved.
    await serviceRoleSupabase
      .from("organizations")
      .update({
        plan,
        billing_interval: billingInterval,
        subscription_status: "trialing",
        current_term_start: key.redeemed_at,
        current_period_end: key.expires_at,
      })
      .eq("id", organizationId);

    return NextResponse.json({ ok: true, provisioned: true, path: 1 });
  }

  // Path 2 (syntriqtech.com self-serve): a real Stripe subscription against
  // the customer created during pre-signup checkout, whose payment method
  // is already on file (see syntriq-landing's setup-webhook route). Using
  // Stripe's own trial_period_days is what makes the day-30 conversion to
  // paid Stripe's native behavior — it auto-invoices the saved payment
  // method and fires customer.subscription.updated on its own, rather than
  // us running a custom one-time charge.
  if (!key.stripe_customer_id) {
    return NextResponse.json({ error: "This trial key is missing its Stripe customer." }, { status: 500 });
  }

  const subscription = await stripe.subscriptions.create({
    customer: key.stripe_customer_id,
    items: [{ price: PRICE_IDS[plan][billingInterval] }],
    trial_period_days: 30,
    metadata: { organization_id: organizationId, source: "trial_path_2" },
  });

  await serviceRoleSupabase
    .from("organizations")
    .update({
      plan,
      billing_interval: billingInterval,
      subscription_status: subscription.status,
      stripe_customer_id: key.stripe_customer_id,
      stripe_subscription_id: subscription.id,
      current_term_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
    })
    .eq("id", organizationId);

  return NextResponse.json({ ok: true, provisioned: true, path: 2 });
}
