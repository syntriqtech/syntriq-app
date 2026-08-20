import Stripe from "stripe";

// Single instantiated client, not the deprecated global stripe.api_key = ...
// pattern. Server-only — never import this from a client component.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
