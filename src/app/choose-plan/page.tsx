"use client";

import { useState } from "react";
import Image from "next/image";
import { ANNUAL_DISCOUNT_LABEL, BillingInterval, PLAN_ANNUAL_PRICING, PLAN_LIMITS, Plan } from "@/lib/planLimits";

const PLAN_COPY: Record<Plan, { name: string }> = {
  basic: { name: "Basic" },
  pro: { name: "Pro" },
};

// Everything not listed here (pay apps, lien waivers, billing check-in, AR
// aging, retention tracking, etc.) is identical on both plans — the real
// differences are the seat/job caps and AI import, so those are the only
// rows worth calling out.
const PLAN_FEATURES: Record<Plan, { label: string; value: string }[]> = {
  basic: [
    { label: "Team members", value: "Up to 2" },
    { label: "Active jobs", value: "Up to 10" },
    { label: "Pay apps & lien waivers", value: "Included" },
    { label: "Billing check-in & AR tracking", value: "Included" },
    { label: "AI contract & change order import", value: "Not included" },
  ],
  pro: [
    { label: "Team members", value: "Up to 6" },
    { label: "Active jobs", value: "Unlimited" },
    { label: "Pay apps & lien waivers", value: "Included" },
    { label: "Billing check-in & AR tracking", value: "Included" },
    { label: "AI contract & change order import", value: "Included" },
  ],
};

export default function ChoosePlanPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChoose(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoadingPlan(null);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/SyntriqLogo2.png" alt="Syntriq" width={64} height={64} priority />
          <h1 className="mt-2 text-xl font-semibold text-navy">Choose your plan</h1>
          <p className="text-sm text-gray-500">30-day free trial on either plan — cancel anytime.</p>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {(["monthly", "annual"] as BillingInterval[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setInterval(option)}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  interval === option ? "bg-navy text-white" : "text-gray-500 hover:text-navy"
                }`}
              >
                {option === "monthly" ? "Monthly" : "Annual"}
                {option === "annual" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      interval === "annual" ? "bg-white/20 text-white" : "bg-teal/15 text-teal"
                    }`}
                  >
                    {ANNUAL_DISCOUNT_LABEL}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {(Object.keys(PLAN_LIMITS) as Plan[]).map((plan) => {
            const limits = PLAN_LIMITS[plan];
            const copy = PLAN_COPY[plan];
            const annual = PLAN_ANNUAL_PRICING[plan];
            return (
              <div
                key={plan}
                className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-navy">{copy.name}</h2>
                  <p className="mt-1 text-2xl font-bold text-navy">
                    {interval === "monthly" ? limits.priceLabel : `${annual.monthlyEquivalentLabel}`}
                  </p>
                  {interval === "annual" && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {annual.priceLabel.replace("/yr", "")} billed annually
                    </p>
                  )}
                </div>
                <ul className="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                  {PLAN_FEATURES[plan].map((feature) => (
                    <li key={feature.label} className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-gray-500">{feature.label}</span>
                      <span
                        className={`text-sm font-medium ${
                          feature.value === "Not included" ? "text-gray-400" : "text-navy"
                        }`}
                      >
                        {feature.value}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleChoose(plan)}
                  disabled={loadingPlan !== null}
                  className="mt-2 w-full rounded-lg bg-navy px-4 py-2.5 font-medium text-white transition-colors hover:bg-navy/90 focus:outline-none focus:ring-2 focus:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingPlan === plan ? "Redirecting…" : `Choose ${copy.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
