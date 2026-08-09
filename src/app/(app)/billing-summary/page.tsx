"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobs } from "@/hooks/useJobs";
import { computeJobBillingRows, JobBillingRow } from "@/lib/billingSummary";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type SortKey = "aging" | "retention" | "openAR" | "lastPayment" | "customer";
type FilterKey = "hasOpenAR" | "overdue90" | "readyRetention" | "notBilledPeriod";

export default function BillingSummaryPage() {
  const router = useRouter();
  const { jobs, isLoading } = useJobs();
  const [rows, setRows] = useState<JobBillingRow[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("aging");
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    if (!jobs || jobs.length === 0 || isLoading) return;
    let cancelled = false;
    setIsLoadingData(true);
    setError(null);
    computeJobBillingRows(jobs)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load billing data.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobs, isLoading]);

  // Apply filters
  const filtered = rows.filter((row) => {
    if (filters.has("hasOpenAR") && row.openAR <= 0.01) return false;
    if (filters.has("overdue90") && row.amount90plus <= 0) return false;
    if (filters.has("readyRetention") && !row.isReadyForRetention) return false;
    if (filters.has("notBilledPeriod") && !row.isNotBilledThisPeriod) return false;
    return true;
  });

  // Apply sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "aging":
        return b.agingSeverityScore - a.agingSeverityScore;
      case "retention":
        return b.retentionHeld - a.retentionHeld;
      case "openAR":
        return b.openAR - a.openAR;
      case "lastPayment":
        return (b.daysSinceLastPayment ?? 999) - (a.daysSinceLastPayment ?? 999);
      case "customer":
        return a.customer.localeCompare(b.customer);
      default:
        return 0;
    }
  });

  // Compute roll-up totals (filter-aware)
  const totals = {
    openAR: filtered.reduce((sum, r) => sum + r.openAR, 0),
    retentionHeld: filtered.reduce((sum, r) => sum + r.retentionHeld, 0),
    billedToDate: filtered.reduce((sum, r) => sum + r.billedToDate, 0),
    paidToDate: filtered.reduce((sum, r) => sum + r.paidToDate, 0),
    current: filtered.reduce((sum, r) => sum + r.amountCurrent, 0),
    days31to60: filtered.reduce((sum, r) => sum + r.amount31to60, 0),
    days61to90: filtered.reduce((sum, r) => sum + r.amount61to90, 0),
    days90plus: filtered.reduce((sum, r) => sum + r.amount90plus, 0),
    readyRetention: filtered.filter((r) => r.isReadyForRetention).length,
    overdue90: filtered.filter((r) => r.isOverdue90plus).length,
  };

  const toggleFilter = (key: FilterKey) => {
    const newFilters = new Set(filters);
    if (newFilters.has(key)) {
      newFilters.delete(key);
    } else {
      newFilters.add(key);
    }
    setFilters(newFilters);
  };

  if (isLoading || isLoadingData) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">AR Aging Summary</h1>
        <p className="text-sm text-gray-500">Loading portfolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">AR Aging Summary</h1>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">AR Aging Summary</h1>
        <p className="mt-1 text-sm text-gray-500">Portfolio overview: aging, collections, retention. Showing {filtered.length} of {rows.length} jobs.</p>
      </div>

      {/* Roll-up totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <p className="text-xs text-gray-400">Open AR</p>
          <p className="text-base font-bold text-navy">{currency.format(totals.openAR)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <p className="text-xs text-gray-400">Retention held</p>
          <p className="text-base font-bold text-navy">{currency.format(totals.retentionHeld)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <p className="text-xs text-gray-400">90+ days</p>
          <p className={`text-base font-bold ${totals.days90plus > 0 ? "text-red-600" : "text-navy"}`}>
            {currency.format(totals.days90plus)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <p className="text-xs text-gray-400">Ready retention</p>
          <p className="text-base font-bold text-teal">{totals.readyRetention}</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <p className="text-xs text-gray-400">Overdue 90+</p>
          <p className={`text-base font-bold ${totals.overdue90 > 0 ? "text-red-600" : "text-navy"}`}>
            {totals.overdue90}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <p className="text-xs text-gray-400">Billed to date</p>
          <p className="text-base font-bold text-navy">{currency.format(totals.billedToDate)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-navy">Sort by</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy"
          >
            <option value="aging">Aging severity (default)</option>
            <option value="retention">Retention ready</option>
            <option value="openAR">Largest open AR</option>
            <option value="lastPayment">Oldest unpaid</option>
            <option value="customer">By customer</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleFilter("hasOpenAR")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filters.has("hasOpenAR")
                ? "bg-teal text-white"
                : "border border-gray-200 text-navy hover:bg-gray-50"
            }`}
          >
            Has open AR
          </button>
          <button
            type="button"
            onClick={() => toggleFilter("overdue90")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filters.has("overdue90")
                ? "bg-red-500 text-white"
                : "border border-gray-200 text-navy hover:bg-gray-50"
            }`}
          >
            90+ only
          </button>
          <button
            type="button"
            onClick={() => toggleFilter("readyRetention")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filters.has("readyRetention")
                ? "bg-teal text-white"
                : "border border-gray-200 text-navy hover:bg-gray-50"
            }`}
          >
            Ready retention
          </button>
          <button
            type="button"
            onClick={() => toggleFilter("notBilledPeriod")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filters.has("notBilledPeriod")
                ? "bg-amber-500 text-white"
                : "border border-gray-200 text-navy hover:bg-gray-50"
            }`}
          >
            Not billed this month
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">PM</th>
              <th className="px-4 py-3 font-medium text-right">Billed / %</th>
              <th className="px-4 py-3 font-medium text-right">Open AR</th>
              <th className="px-4 py-3 font-medium text-right">Current</th>
              <th className="px-4 py-3 font-medium text-right">31-60</th>
              <th className="px-4 py-3 font-medium text-right">61-90</th>
              <th className="px-4 py-3 font-medium text-right">90+</th>
              <th className="px-4 py-3 font-medium text-right">Retention</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-4 text-center text-gray-500">
                  No jobs match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.jobId}
                  className={`cursor-pointer transition-colors hover:bg-gray-50 ${row.isOverdue90plus ? "bg-red-50" : row.isReadyForRetention ? "bg-teal/5" : ""}`}
                  onClick={() => router.push(`/jobs/${row.jobId}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-navy">{row.jobName || <span className="text-amber-600">⚠ No name</span>}</div>
                    <div className="text-xs text-gray-400">{row.jobNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-navy">{row.customer}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-600">{row.ctiPm}</div>
                    {row.billingPlatform && (
                      <div className="text-xs text-gray-400">{row.billingPlatform}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold text-navy">{currency.format(row.billedToDate)}</div>
                    <div className="text-xs text-gray-500">{percent.format(row.percentBilled / 100)}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${row.openAR > 0 ? "text-orange-600" : "text-gray-400"}`}>
                    {currency.format(row.openAR)}
                  </td>
                  <td className="px-4 py-3 text-right text-navy">{currency.format(row.amountCurrent)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{currency.format(row.amount31to60)}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{currency.format(row.amount61to90)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">
                    {currency.format(row.amount90plus)}
                  </td>
                  <td className="px-4 py-3 text-right text-navy">{currency.format(row.retentionHeld)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.isReadyForRetention && (
                        <span className="inline-block rounded-full bg-teal/20 px-2 py-1 text-xs font-semibold text-teal">
                          Retention ready
                        </span>
                      )}
                      {row.isOverdue90plus && (
                        <span className="inline-block rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          90+ overdue
                        </span>
                      )}
                      {row.isNotBilledThisPeriod && (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                          Not billed
                        </span>
                      )}
                      {row.isReadyToClose && (
                        <span className="inline-block rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                          Ready to close
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
