"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DbJob } from "@/lib/jobs";
import { computeJobBillingRows, JobBillingRow } from "@/lib/billingSummary";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function worstBucket(row: JobBillingRow): "Current" | "31-60" | "61-90" | "90+" {
  if (row.amount90plus > 0) return "90+";
  if (row.amount61to90 > 0) return "61-90";
  if (row.amount31to60 > 0) return "31-60";
  return "Current";
}

const BUCKET_STYLE: Record<string, string> = {
  "Current": "bg-gray-100 text-gray-600",
  "31-60":   "bg-amber-100 text-amber-700",
  "61-90":   "bg-orange-100 text-orange-700",
  "90+":     "bg-red-100 text-red-700",
};

export default function OpenARWidget({
  jobs,
  isLoadingJobs,
}: {
  jobs: DbJob[];
  isLoadingJobs: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<JobBillingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isLoadingJobs || jobs.length === 0) return;
    let cancelled = false;
    setIsLoading(true);
    computeJobBillingRows(jobs)
      .then((data) => {
        if (cancelled) return;
        const withAR = data
          .filter((r) => r.openAR > 0.01)
          .sort((a, b) => b.agingSeverityScore - a.agingSeverityScore)
          .slice(0, 5);
        setRows(withAR);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [jobs, isLoadingJobs]);

  const loading = isLoadingJobs || isLoading;

  function handleRowClick(jobNumber: string) {
    sessionStorage.setItem("pay_initial_job", jobNumber);
    router.push("/pay-applications");
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 className="text-base font-bold text-navy">Open AR due</h2>
        <Link
          href="/billing-summary"
          className="text-sm font-medium text-teal hover:underline"
        >
          View all →
        </Link>
      </div>

      {loading ? (
        <p className="py-4 text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-sm text-gray-400">No outstanding AR — all caught up.</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => {
            const bucket = worstBucket(row);
            const is90plus = bucket === "90+";
            return (
              <button
                type="button"
                key={row.jobId}
                onClick={() => handleRowClick(row.jobNumber)}
                className={`flex w-full items-center justify-between gap-4 border-b border-gray-50 px-2 py-3.5 text-left last:border-0 hover:bg-gray-50 ${
                  is90plus ? "rounded-lg bg-red-50 hover:bg-red-100" : ""
                }`}
                title={`View record payment for ${row.jobName || row.jobNumber}`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-semibold ${is90plus ? "text-red-800" : "text-navy"}`}>
                    {row.jobName || row.jobNumber}
                  </div>
                  <div className="text-xs text-gray-400">{row.customer}</div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BUCKET_STYLE[bucket]}`}>
                    {bucket} days
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${is90plus ? "text-red-700" : "text-navy"}`}>
                    {currency.format(row.openAR)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
