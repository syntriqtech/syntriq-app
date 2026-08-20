"use client";

import { useState } from "react";
import Button from "@/components/Button";
import { PLAN_LIMITS } from "@/lib/planLimits";

type Props = {
  featureName: string;
  onClose: () => void;
};

// Shared upgrade prompt for any Pro-gated feature — hits
// create-checkout-session directly (which handles both a brand-new
// subscription and swapping an existing Basic one) rather than linking to
// /pricing, which is still a placeholder.
export default function ProUpgradeModal({ featureName, onClose }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start upgrade.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start upgrade.");
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-bold text-navy">Pro feature</h2>
        <p className="mt-2 text-sm text-gray-600">
          {featureName} is available on the Pro plan ({PLAN_LIMITS.pro.priceLabel}). Upgrade to unlock it
          for your whole team.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            Not now
          </button>
          <Button type="button" onClick={handleUpgrade} disabled={isLoading} className="w-auto px-5">
            {isLoading ? "Redirecting…" : "Upgrade to Pro"}
          </Button>
        </div>
      </div>
    </div>
  );
}
