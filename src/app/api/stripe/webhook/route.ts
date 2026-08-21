import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { Plan, BillingInterval } from "@/lib/planLimits";

const PRICE_TO_PLAN: Record<string, Plan> = {
  [process.env.STRIPE_PRICE_BASIC!]: "basic",
  [process.env.STRIPE_PRICE_PRO!]: "pro",
  [process.env.STRIPE_PRICE_BASIC_ANNUAL!]: "basic",
  [process.env.STRIPE_PRICE_PRO_ANNUAL!]: "pro",
};

async function planForSubscription(subscription: Stripe.Subscription): Promise<Plan | null> {
  const priceId = subscription.items.data[0]?.price.id;
  return priceId ? PRICE_TO_PLAN[priceId] ?? null : null;
}

// Derived from the price's own recurring interval rather than a second
// hardcoded price-id map — works for any price on the product regardless of
// which env var it came from.
function intervalForSubscription(subscription: Stripe.Subscription): BillingInterval | null {
  const stripeInterval = subscription.items.data[0]?.price.recurring?.interval;
  if (stripeInterval === "month") return "monthly";
  if (stripeInterval === "year") return "annual";
  return null;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Idempotency — Stripe can and does redeliver events.
  const { data: existing } = await supabase.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, deduped: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const plan = await planForSubscription(subscription);
        await supabase
          .from("organizations")
          .update({
            stripe_subscription_id: subscription.id,
            plan,
            billing_interval: intervalForSubscription(subscription),
            subscription_status: subscription.status,
            current_term_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
          })
          .eq("stripe_customer_id", session.customer as string);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = await planForSubscription(subscription);

      // Self-contained, order-independent signal for "this was a Path 2
      // trial (see /api/trial/provision) whose first post-trial charge
      // just failed" — Stripe includes the pre-update status on every
      // *.updated event, so this doesn't depend on what invoice.payment_failed
      // did or didn't already write to our own DB (that ordering isn't
      // guaranteed). trialing -> anything other than active/trialing
      // itself (past_due, unpaid, incomplete...) means the conversion
      // charge did not succeed.
      const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
      const trialConversionFailed =
        previousAttributes?.status === "trialing" && subscription.status !== "active" && subscription.status !== "trialing";

      if (trialConversionFailed) {
        // No retry, no grace period: cancel outright rather than leaving it
        // past_due for Stripe's normal dunning retries to possibly recover
        // on their own — re-subscribing means a deliberate, fresh checkout.
        await stripe.subscriptions.cancel(subscription.id).catch(() => {});
        await supabase
          .from("organizations")
          .update({ subscription_status: "canceled" })
          .eq("stripe_customer_id", subscription.customer as string);
        break;
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("pending_plan, stripe_subscription_schedule_id")
        .eq("stripe_customer_id", subscription.customer as string)
        .maybeSingle();

      await supabase
        .from("organizations")
        .update({
          stripe_subscription_id: subscription.id,
          plan,
          billing_interval: intervalForSubscription(subscription),
          subscription_status: subscription.status,
          current_term_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
        })
        .eq("stripe_customer_id", subscription.customer as string);

      // A scheduled downgrade (see create-checkout-session/route.ts) just
      // took effect at renewal if the plan this event reports now matches
      // what was pending. Release the schedule so the subscription goes
      // back to being a plain subscription — any future plan change should
      // go through subscriptions.update() directly again, not the schedule.
      if (org?.pending_plan && org.stripe_subscription_schedule_id && org.pending_plan === plan) {
        await stripe.subscriptionSchedules.release(org.stripe_subscription_schedule_id);
        await supabase
          .from("organizations")
          .update({ pending_plan: null, pending_plan_effective_at: null, stripe_subscription_schedule_id: null })
          .eq("stripe_customer_id", subscription.customer as string);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from("organizations")
        .update({ subscription_status: "canceled" })
        .eq("stripe_customer_id", subscription.customer as string);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        // The trial-conversion "cancel immediately, no retry" decision is
        // made in customer.subscription.updated (it carries the pre-update
        // status, which this event doesn't) — that handler may process
        // before or after this one, so this only avoids clobbering a
        // cancellation that already landed; it never itself decides to
        // cancel. Ordinary renewal failures fall through to past_due as
        // always.
        const { data: org } = await supabase
          .from("organizations")
          .select("subscription_status")
          .eq("stripe_customer_id", invoice.customer as string)
          .maybeSingle();

        if (org?.subscription_status !== "canceled") {
          await supabase
            .from("organizations")
            .update({ subscription_status: "past_due" })
            .eq("stripe_customer_id", invoice.customer as string);
        }
      }
      break;
    }

    default:
      break;
  }

  await supabase.from("stripe_events").insert({ id: event.id, type: event.type });

  return NextResponse.json({ received: true });
}
