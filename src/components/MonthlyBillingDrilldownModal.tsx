"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DbJob } from "@/lib/jobs";
import { PayApplication } from "@/lib/payApplicationsDb";
import { computeMonthBillingDrilldown } from "@/lib/dashboardMetrics";
import { formatDate } from "@/lib/dateUtils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Props = {
  monthKey: string;
  applications: PayApplication[];
  jobs: DbJob[];
  onClose: () => void;
};

export default function MonthlyBillingDrilldownModal({ monthKey, applications, jobs, onClose }: Props) {
  const router = useRouter();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const drilldown = useMemo(
    () => computeMonthBillingDrilldown(applications, jobs, monthKey),
    [applications, jobs, monthKey]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-navy">Monthly Billing — {drilldown.monthLabel}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {drilldown.jobRows.length} job{drilldown.jobRows.length === 1 ? "" : "s"} billed · Total{" "}
              <span className="font-semibold text-navy">{currency.format(drilldown.grandTotal)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 flex-none text-xl leading-none text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {drilldown.jobRows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">
              No pay applications with a billing period ending in {drilldown.monthLabel}.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {drilldown.jobRows.map((row) => {
                const isExpanded = expandedJobId === row.jobId;
                return (
                  <div key={row.jobId}>
                    <button
                      type="button"
                      onClick={() => setExpandedJobId(isExpanded ? null : row.jobId)}
                      className="flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex-none text-xs text-gray-400 transition-transform"
                          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                        >
                          ▶
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-navy">
                            {row.jobName}
                            {row.jobNumber && (
                              <span className="ml-2 text-xs font-normal text-gray-400">#{row.jobNumber}</span>
                            )}
                          </div>
                          <div className="truncate text-xs text-gray-500">{row.customer}</div>
                        </div>
                      </div>
                      <span className="flex-none text-sm font-semibold text-navy tabular-nums">
                        {currency.format(row.total)}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="bg-gray-50 px-6 py-2">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="py-1.5 font-medium">App #</th>
                              <th className="py-1.5 font-medium">Period end</th>
                              <th className="py-1.5 text-right font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {row.payApps.map((app) => (
                              <tr
                                key={app.id}
                                onClick={() => router.push(`/pay-applications/${app.id}`)}
                                className="cursor-pointer hover:bg-gray-100"
                                title="View pay application"
                              >
                                <td className="py-1.5 font-medium text-teal hover:underline">
                                  #{app.applicationNumber}
                                </td>
                                <td className="py-1.5 text-gray-600">{formatDate(app.periodTo)}</td>
                                <td className="py-1.5 text-right font-medium text-navy tabular-nums">
                                  {currency.format(app.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3.5">
          <span className="text-sm font-semibold text-gray-700">Grand total</span>
          <span className="text-base font-bold text-navy tabular-nums">
            {currency.format(drilldown.grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
