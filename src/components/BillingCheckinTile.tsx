"use client";

import Link from "next/link";
import { useBillingCheckinBadge } from "@/hooks/useBillingCheckinBadge";

function currentMonthName(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function BillingCheckinTile() {
  const { pendingCount } = useBillingCheckinBadge();

  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-6 rounded-2xl border border-teal/30 bg-teal/5 px-6 py-4">
      <div className="h-10 w-1 flex-none rounded-full bg-teal" />

      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal">
          Monthly Billing Check-in
        </div>
        <div className="mt-0.5 flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl font-bold text-navy">{pendingCount}</span>
          <span className="text-sm text-gray-600">
            job{pendingCount !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} a billing
            review for {currentMonthName()}
          </span>
        </div>
      </div>

      <div className="flex-none">
        <Link
          href="/billing-checkin"
          className="inline-flex items-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal/90 transition-colors"
        >
          Review now
        </Link>
      </div>
    </div>
  );
}
