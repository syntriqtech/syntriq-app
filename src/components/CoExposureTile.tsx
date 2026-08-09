"use client";

import Link from "next/link";
import { useCoExposure } from "@/hooks/useCoExposure";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function CoExposureTile() {
  const { amount, count, readyToApplyCount, isLoading } = useCoExposure();

  if (isLoading) return null;
  if (count === 0 && readyToApplyCount === 0) return null;

  return (
    <div className="flex items-center gap-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
      <div className="h-10 w-1 flex-none rounded-full bg-amber-400" />

      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          CO Exposure — not in contract
        </div>
        <div className="mt-0.5 flex items-baseline gap-3 flex-wrap">
          <span className="text-2xl font-bold text-amber-900">
            {currency.format(amount)}
          </span>
          <span className="text-sm text-amber-700">
            {count} CO{count !== 1 ? "s" : ""} pending or submitted
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 flex-none">
        {readyToApplyCount > 0 && (
          <Link
            href="/change-orders?filter=ready"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 transition-colors"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white text-[10px] font-bold">
              {readyToApplyCount}
            </span>
            Ready to apply
          </Link>
        )}
        <Link
          href="/change-orders?filter=exposure"
          className="text-sm font-medium text-amber-700 hover:text-amber-900 hover:underline"
        >
          View all COs →
        </Link>
      </div>
    </div>
  );
}
