"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DbJob } from "@/lib/jobs";
import { fetchCheckinsByMonth } from "@/lib/billingCheckinDb";

const URGENCY_STYLE: Record<string, string> = {
  calm:   "bg-gray-100 text-gray-600",
  amber:  "bg-amber-100 text-amber-700",
  orange: "bg-orange-100 text-orange-700",
  red:    "bg-red-100 text-red-700",
};

function urgencyTier(days: number): string {
  if (days <= 1) return "red";
  if (days <= 3) return "orange";
  if (days <= 7) return "amber";
  return "calm";
}

function daysUntilDue(dueDay: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

type BillingDueRow = { job: DbJob; daysLeft: number };

export default function BillingDueWidget({
  jobs,
  isLoadingJobs,
}: {
  jobs: DbJob[];
  isLoadingJobs: boolean;
}) {
  const [rows, setRows] = useState<BillingDueRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isLoadingJobs || jobs.length === 0) return;
    let cancelled = false;
    setIsLoading(true);

    const month = new Date().toISOString().slice(0, 7);
    fetchCheckinsByMonth(month)
      .then((checkins) => {
        if (cancelled) return;
        const yesIds = new Set(
          checkins.filter((c) => c.decision === "yes").map((c) => c.jobId)
        );
        const billing = jobs
          .filter((j) => yesIds.has(j.id))
          .map((j) => ({ job: j, daysLeft: daysUntilDue(j.billingDueDay) }))
          .sort((a, b) => a.daysLeft - b.daysLeft);
        setRows(billing);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [jobs, isLoadingJobs]);

  if (isLoading || isLoadingJobs || rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 className="text-base font-bold text-navy">Billing due this month</h2>
        <Link
          href="/billing-checkin"
          className="text-sm font-medium text-teal hover:underline"
        >
          Check-in →
        </Link>
      </div>

      <div className="flex flex-col">
        {rows.map(({ job, daysLeft }) => {
          const tier = urgencyTier(daysLeft);
          const isRed = tier === "red";
          return (
            <div
              key={job.id}
              className={`flex items-center justify-between gap-4 border-b border-gray-50 py-3.5 last:border-0 ${
                isRed ? "rounded-lg bg-red-50 px-3 -mx-3" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${isRed ? "text-red-800" : "text-navy"}`}>
                  {job.jobName || job.jobNumber}
                </div>
                <div className="text-xs text-gray-400">
                  {job.customer} · due the {job.billingDueDay}{ordinal(job.billingDueDay)}
                </div>
              </div>
              <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${URGENCY_STYLE[tier]}`}>
                {daysLeft < 0
                  ? `Due ${-daysLeft} day${-daysLeft === 1 ? "" : "s"} ago`
                  : daysLeft === 0
                  ? "Due today"
                  : daysLeft === 1
                  ? "Due tomorrow"
                  : `${daysLeft} days`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
