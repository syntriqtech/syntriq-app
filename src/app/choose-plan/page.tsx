"use client";

import { useState } from "react";
import Image from "next/image";
import { PLAN_LIMITS, Plan } from "@/lib/planLimits";

const PLAN_COPY: Record<Plan, { name: string; users: string; jobs: string }> = {
  basic: { name: "Basic", users: "1-2 users", jobs: "Up to 10 active jobs" },
  pro: { name: "Pro", users: "1-6 users", jobs: "Unlimited jobs" },
};

export default function ChoosePlanPage() {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChoose(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {(Object.keys(PLAN_LIMITS) as Plan[]).map((plan) => {
            const limits = PLAN_LIMITS[plan];
            const copy = PLAN_COPY[plan];
            return (
              <div
                key={plan}
                className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-navy">{copy.name}</h2>
                  <p className="mt-1 text-2xl font-bold text-navy">{limits.priceLabel}</p>
                </div>
                <ul className="flex flex-col gap-1.5 text-sm text-gray-600">
                  <li>{copy.users}</li>
                  <li>{copy.jobs}</li>
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
