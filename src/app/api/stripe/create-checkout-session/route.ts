import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { stripe } from "@/lib/stripe";
import { Plan, BillingInterval } from "@/lib/planLimits";

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

// Mirrors the current phase of a subscription onto phase 0 of a new
// schedule, so releasing/rebuilding it doesn't accidentally change what's
// billing right now. Stripe returns prices as plain ID strings here since
// we never expand them.
function currentPhaseItems(phase: Stripe.SubscriptionSchedule.Phase) {
  return phase.items.map((item) => ({
    price: typeof item.price === "string" ? item.price : item.price.id,
    quantity: item.quantity,
  }));
}

export async function POST(req: NextRequest) {
  const { plan, interval } = (await req.json()) as { plan?: Plan; interval?: BillingInterval };
  if (plan !== "basic" && plan !== "pro") {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  if (interval !== undefined && interval !== "monthly" && interval !== "annual") {
    return NextResponse.json({ error: "Invalid billing interval." }, { status: 400 });
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
    .select(
      "stripe_customer_id, stripe_subscription_id, plan, subscription_status, billing_interval, stripe_subscription_schedule_id"
    )
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

  // Plan/interval change on an already-live subscription (e.g. Basic -> Pro
  // from the upgrade prompt, or Monthly -> Annual from Billing & Plan) —
  // swap the existing subscription's price instead of opening a new
  // Checkout Session, which would create a SECOND concurrent subscription
  // for the same customer and double-bill them. Only 'trialing'/'active'
  // count as "live"; anything else (past_due, canceled, incomplete...)
  // falls through to a fresh Checkout Session below.
  if (
    org.stripe_subscription_id &&
    (org.subscription_status === "trialing" || org.subscription_status === "active")
  ) {
    const currentInterval: BillingInterval = (org.billing_interval as BillingInterval) ?? "monthly";
    // No interval passed (e.g. the Pro-upgrade prompt, which only ever
    // sends { plan }) means "keep whatever interval this org is already
    // on" — never silently drop an annual customer back to monthly.
    const requestedInterval: BillingInterval = interval ?? currentInterval;

    if (org.plan === plan && currentInterval === requestedInterval) {
      return NextResponse.json({ url: `${req.nextUrl.origin}/billing-plan` });
    }

    if (currentInterval === "annual" && requestedInterval === "monthly") {
      return NextResponse.json(
        {
          error:
            "Annual plans can't switch back to monthly billing mid-term. This isn't available yet — contact support if you need this.",
        },
        { status: 400 }
      );
    }

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json({ error: "Could not find your subscription item." }, { status: 500 });
    }

    const serviceRoleSupabase = createServiceRoleClient();

    // Any new plan action (upgrade, or an interval switch) supersedes a
    // downgrade that was scheduled to take effect at renewal — release the
    // schedule so subscriptions.update() below is safe to call directly
    // again (Stripe's own guidance: once a schedule is attached, further
    // edits should go through the Schedule API, not subscriptions.update).
    if (org.stripe_subscription_schedule_id) {
      await stripe.subscriptionSchedules.release(org.stripe_subscription_schedule_id);
      await serviceRoleSupabase
        .from("organizations")
        .update({ pending_plan: null, pending_plan_effective_at: null, stripe_subscription_schedule_id: null })
        .eq("id", organizationId);
    }

    // Rule (c): Pro Annual -> Basic Annual can't happen mid-term. Schedule
    // it for the current term's renewal via a subscription schedule instead
    // of touching the live subscription — Stripe flips the price
    // automatically when the new phase starts, no cron needed.
    if (currentInterval === "annual" && requestedInterval === "annual" && org.plan === "pro" && plan === "basic") {
      const schedule = await stripe.subscriptionSchedules.create({ from_subscription: org.stripe_subscription_id });
      const currentPhase = schedule.phases[0];
      const updatedSchedule = await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: currentPhaseItems(currentPhase),
            start_date: currentPhase.start_date,
            end_date: currentPhase.end_date,
          },
          {
            items: [{ price: PRICE_IDS[plan][requestedInterval], quantity: 1 }],
            duration: { interval: "year", interval_count: 1 },
          },
        ],
      });

      await serviceRoleSupabase
        .from("organizations")
        .update({
          pending_plan: plan,
          pending_plan_effective_at: new Date(currentPhase.end_date * 1000).toISOString(),
          stripe_subscription_schedule_id: updatedSchedule.id,
        })
        .eq("id", organizationId);

      return NextResponse.json({ url: `${req.nextUrl.origin}/billing-plan` });
    }

    let updateParams: Stripe.SubscriptionUpdateParams;

    if (currentInterval === "monthly" && requestedInterval === "annual") {
      // Rule (a): Monthly -> Annual (either plan). No proration — discard
      // whatever's left on the current monthly cycle, charge the full
      // annual price today, start a fresh 12-month term today.
      //
      // Stripe's docs describe changing the billing interval as something
      // that resets the billing date and bills immediately on its own —
      // that's true for "classic" billing_mode subscriptions, but this
      // account's subscriptions use billing_mode "flexible" (confirmed
      // against the live test account), where that reset does NOT happen
      // automatically. billing_cycle_anchor: "now" is what actually forces
      // it here; without it, the price swaps but nothing gets billed until
      // the old monthly cycle would've renewed anyway. proration_behavior:
      // "none" is what then suppresses the credit for the unused monthly
      // time that the anchor reset would otherwise generate. If still on
      // the free trial, end it now too, so "immediately" is unambiguous
      // rather than silently waiting for the trial to lapse.
      updateParams = {
        items: [{ id: itemId, price: PRICE_IDS[plan][requestedInterval] }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
      };
      if (org.subscription_status === "trialing") {
        updateParams.trial_end = "now";
      }
    } else if (currentInterval === "annual" && requestedInterval === "annual") {
      // Rule (b): Basic Annual -> Pro Annual (the only same-interval-annual
      // case that reaches here — the Pro -> Basic downgrade already
      // returned above via the schedule path). always_invoice is what
      // actually charges the prorated difference today instead of letting
      // it ride on next year's invoice, which is what create_prorations
      // alone would do for a same-interval change.
      updateParams = {
        items: [{ id: itemId, price: PRICE_IDS[plan][requestedInterval] }],
        proration_behavior: "always_invoice",
      };
    } else {
      // currentInterval === "monthly" && requestedInterval === "monthly" —
      // the pre-existing Basic <-> Pro monthly swap, unchanged.
      updateParams = {
        items: [{ id: itemId, price: PRICE_IDS[plan][requestedInterval] }],
        proration_behavior: "create_prorations",
      };
    }

    const updated = await stripe.subscriptions.update(org.stripe_subscription_id, updateParams);

    // Write the new plan back immediately with the service-role client — the
    // authenticated client can't (organizations_update_owner_only restricts
    // updates to owners, and any org member can trigger an upgrade) — rather
    // than waiting on the customer.subscription.updated webhook, which will
    // still fire and just redundantly write the same values.
    await serviceRoleSupabase
      .from("organizations")
      .update({
        plan,
        billing_interval: requestedInterval,
        subscription_status: updated.status,
        current_term_start: new Date(updated.items.data[0].current_period_start * 1000).toISOString(),
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

  const checkoutInterval: BillingInterval = interval ?? "monthly";
  const origin = req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // No payment_method_types — Stripe determines eligible methods dynamically.
    line_items: [{ price: PRICE_IDS[plan][checkoutInterval], quantity: 1 }],
    subscription_data: {
      trial_period_days: 30,
      metadata: { organization_id: organizationId, plan, interval: checkoutInterval },
    },
    success_url: `${origin}/billing-plan?checkout=success`,
    cancel_url: `${origin}/choose-plan`,
  });

  return NextResponse.json({ url: session.url });
}
