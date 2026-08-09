"use client";

import { useEffect, useState } from "react";
import { DbJob } from "@/lib/jobs";
import { JobMetrics } from "@/lib/dashboardMetrics";
import { fetchChangeOrders } from "@/lib/changeOrdersDb";
import DonutPercent from "@/components/DonutPercent";

const currencyShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Props = {
  metrics: JobMetrics[];
  jobs: DbJob[];
  isSpinning: boolean;
  onSelectJob: (jobId: string) => void;
  emptyMessage?: string;
  showAppColumn?: boolean;
  showCoCountColumn?: boolean;
};

export default function JobListTable({ metrics, jobs, isSpinning, onSelectJob, emptyMessage, showAppColumn = false, showCoCountColumn = false }: Props) {
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [coCounts, setCoCounts] = useState<Record<string, number>>({});

  // Load CO counts for all jobs in one query
  useEffect(() => {
    let cancelled = false;
    fetchChangeOrders()
      .then((cos) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        const totals: Record<string, number> = {};
        for (const co of cos) {
          if (co.status === "pending" || co.status === "submitted") {
            counts[co.jobId] = (counts[co.jobId] ?? 0) + 1;
          }
          // Every status counts toward the total except void.
          if (co.status !== "void") {
            totals[co.jobId] = (totals[co.jobId] ?? 0) + 1;
          }
        }
        setPendingCounts(counts);
        setCoCounts(totals);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-gray-500">
            <th className="px-6 py-3 font-medium">Job # / Name</th>
            <th className="px-6 py-3 font-medium">GC</th>
            <th className="px-6 py-3 font-medium">PM</th>
            <th className="px-6 py-3 font-medium">Billing Platform</th>
            {showAppColumn && <th className="px-6 py-3 font-medium text-center">App #</th>}
            {showCoCountColumn && <th className="px-6 py-3 font-medium text-center">Change Orders</th>}
            <th className="px-6 py-3 font-medium text-right">Contract (revised)</th>
            <th className="px-6 py-3 font-medium text-right">Billed to date</th>
            <th className="px-6 py-3 font-medium text-right">Balance to finish</th>
            <th className="px-6 py-3 font-medium text-right">Retention held</th>
            <th className="px-6 py-3 font-medium text-center">Billed %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isSpinning ? (
            <tr>
              <td colSpan={9 + (showAppColumn ? 1 : 0) + (showCoCountColumn ? 1 : 0)} className="px-6 py-6 text-sm text-gray-500">Loading…</td>
            </tr>
          ) : metrics.length === 0 ? (
            <tr>
              <td colSpan={9 + (showAppColumn ? 1 : 0) + (showCoCountColumn ? 1 : 0)} className="px-6 py-6 text-sm text-gray-500">
                {emptyMessage ?? "No jobs found."}
              </td>
            </tr>
          ) : (
            metrics.map((row) => {
              const pendingCount = pendingCounts[row.id] ?? 0;
              const coCount = coCounts[row.id] ?? 0;
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                  onClick={() => onSelectJob(row.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-navy">
                        {row.jobName || <span className="text-amber-600">⚠ No name</span>}
                      </span>
                      {pendingCount > 0 && (
                        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 py-0.5 text-[10px] font-bold text-white">
                          {pendingCount}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{row.jobNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-navy">{row.customer}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {jobs.find((j) => j.id === row.id)?.ctiPm || "—"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {jobs.find((j) => j.id === row.id)?.billingPlatform || "—"}
                  </td>
                  {showAppColumn && (
                    <td className="px-6 py-4 text-center font-medium text-navy">
                      {row.currentApplicationNumber != null ? `#${row.currentApplicationNumber}` : "—"}
                    </td>
                  )}
                  {showCoCountColumn && (
                    <td className="px-6 py-4 text-center font-medium text-navy">
                      {coCount > 0 ? coCount : "—"}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right font-medium text-navy tabular-nums">
                    {currencyShort.format(row.contractValue)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-navy tabular-nums">
                    {currencyShort.format(row.billedToDate)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-navy tabular-nums">
                    {currencyShort.format(row.balanceToFinish)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-navy tabular-nums">
                    {currencyShort.format(row.retention)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <DonutPercent percent={row.percentComplete} size={52} />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
