import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { Plan } from "@/lib/planLimits";

const PRICE_TO_PLAN: Record<string, Plan> = {
  [process.env.STRIPE_PRICE_BASIC!]: "basic",
  [process.env.STRIPE_PRICE_PRO!]: "pro",
};

async function planForSubscription(subscription: Stripe.Subscription): Promise<Plan | null> {
  const priceId = subscription.items.data[0]?.price.id;
  return priceId ? PRICE_TO_PLAN[priceId] ?? null : null;
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
            subscription_status: subscription.status,
            current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
          })
          .eq("stripe_customer_id", session.customer as string);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = await planForSubscription(subscription);
      await supabase
        .from("organizations")
        .update({
          stripe_subscription_id: subscription.id,
          plan,
          subscription_status: subscription.status,
          current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
        })
        .eq("stripe_customer_id", subscription.customer as string);
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
        await supabase
          .from("organizations")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", invoice.customer as string);
      }
      break;
    }

    default:
      break;
  }

  await supabase.from("stripe_events").insert({ id: event.id, type: event.type });

  return NextResponse.json({ received: true });
}
