"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { DbJob } from "@/lib/jobs";
import {
  BillingCheckin,
  fetchCheckinsByMonth,
  upsertCheckin,
  advanceCheckinMonth,
  deleteCheckin,
  currentMonth,
  nextMonth,
} from "@/lib/billingCheckinDb";
import { computeAllJobMetrics, JobMetrics } from "@/lib/dashboardMetrics";
import { fetchChangeOrders } from "@/lib/changeOrdersDb";
import { fetchAllPayApplications, PayApplication } from "@/lib/payApplicationsDb";

function formatMonth(yyyyMm: string): string {
  if (!yyyyMm) return "";
  const [y, m] = yyyyMm.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(yyyyMmDd: string): string {
  if (!yyyyMmDd) return "";
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function daysUntilDue(dueDay: number, forMonth: string): number {
  const [y, m] = forMonth.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(y, m - 1, dueDay);
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
}

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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function CompletionBar({ percent }: { percent: number | undefined }) {
  if (percent === undefined) {
    return <div className="h-1.5 w-28 rounded-full bg-gray-100" />;
  }
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : "bg-teal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums text-gray-500">{pct}%</span>
    </div>
  );
}

function PendingCoBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      {count} CO pending
    </span>
  );
}

function BillingPlatformBadge({ platform }: { platform: string }) {
  if (!platform) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      {platform}
    </span>
  );
}

type DeferState = { jobId: string; month: string };

export default function BillingCheckinPage() {
  const { jobs, isLoading: isLoadingJobs, reload: reloadJobs } = useJobs();
  const [checkins, setCheckins] = useState<BillingCheckin[]>([]);
  const [isLoadingCheckins, setIsLoadingCheckins] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [deferState, setDeferState] = useState<DeferState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Map<string, JobMetrics>>(new Map());
  const [pendingCoCounts, setPendingCoCounts] = useState<Record<string, number>>({});
  const [payAppsThisMonth, setPayAppsThisMonth] = useState<Map<string, PayApplication[]>>(new Map());

  const month = currentMonth();

  function loadCheckins() {
    setIsLoadingCheckins(true);
    fetchCheckinsByMonth(month)
      .then((data) => {
        setCheckins(data);
        window.dispatchEvent(new CustomEvent("syntriq:billing-checkin-updated"));
      })
      .catch(() => setCheckins([]))
      .finally(() => setIsLoadingCheckins(false));
  }

  useEffect(() => { loadCheckins(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchChangeOrders()
      .then((cos) => {
        const counts: Record<string, number> = {};
        for (const co of cos) {
          if (co.status === "pending" || co.status === "submitted") {
            counts[co.jobId] = (counts[co.jobId] ?? 0) + 1;
          }
        }
        setPendingCoCounts(counts);
      })
      .catch(() => {});
  }, []);

  // Pay apps actually dated this month — used to tell "confirmed billing
  // this month" apart from "already billed this month" so a job whose PA
  // submitted the paperwork doesn't keep showing as overdue.
  useEffect(() => {
    fetchAllPayApplications()
      .then((apps) => {
        const map = new Map<string, PayApplication[]>();
        for (const app of apps) {
          if (app.applicationDate.slice(0, 7) !== month) continue;
          const list = map.get(app.jobId);
          if (list) list.push(app);
          else map.set(app.jobId, [app]);
        }
        setPayAppsThisMonth(map);
      })
      .catch(() => {});
  }, [month]);

  useEffect(() => {
    if (jobs.length === 0) return;
    let cancelled = false;
    computeAllJobMetrics(jobs)
      .then((list) => {
        if (!cancelled) setMetrics(new Map(list.map((m) => [m.id, m])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  const responseMap = new Map(checkins.map((c) => [c.jobId, c]));

  // Jobs pending check-in this month
  const pendingJobs = jobs.filter(
    (j) =>
      j.billingCheckinMonth !== "" &&
      j.billingCheckinMonth <= month &&
      !responseMap.has(j.id)
  );

  // Jobs that said "yes" this month (by response — their checkin_month may be next month now)
  const yesJobs = checkins
    .filter((c) => c.decision === "yes")
    .flatMap((c) => {
      const job = jobs.find((j) => j.id === c.jobId);
      return job ? [{ checkin: c, job }] : [];
    });

  // Split "yes" jobs into ones that already have a pay app on file this
  // month (billed) vs. ones still waiting on the actual paperwork.
  const billedJobs = yesJobs.filter(({ job }) => payAppsThisMonth.has(job.id));
  const awaitingJobs = yesJobs.filter(({ job }) => !payAppsThisMonth.has(job.id));

  // Jobs that said "no" this month (deferred)
  const noJobs = checkins
    .filter((c) => c.decision === "no")
    .flatMap((c) => {
      const job = jobs.find((j) => j.id === c.jobId);
      return job ? [{ checkin: c, job }] : [];
    });

  async function handleYes(job: DbJob) {
    setError(null);
    setSubmitting(job.id);
    try {
      await upsertCheckin(job.id, month, "yes");
      await advanceCheckinMonth(job.id, nextMonth(month));
      loadCheckins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDefer(job: DbJob) {
    if (!deferState || deferState.jobId !== job.id) return;
    setError(null);
    setSubmitting(job.id);
    try {
      await upsertCheckin(job.id, month, "no");
      await advanceCheckinMonth(job.id, deferState.month);
      setDeferState(null);
      loadCheckins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleUndo(job: DbJob) {
    setError(null);
    setSubmitting(job.id);
    try {
      // Delete this month's check-in answer
      await deleteCheckin(job.id, month);
      // Restore billing_checkin_month to this month so the job reappears as pending
      await advanceCheckinMonth(job.id, month);
      await Promise.all([reloadJobs(), loadCheckins()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo.");
    } finally {
      setSubmitting(null);
    }
  }

  const totalDue = pendingJobs.length + yesJobs.length + noJobs.length;

  if (isLoadingJobs || isLoadingCheckins) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Billing Check-in</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Billing Check-in</h1>
        <p className="mt-1 text-sm text-gray-500">
          {formatMonth(month)} · Review which jobs you'll be billing this month.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary strip */}
      {totalDue > 0 && (
        <div className="grid grid-cols-4 divide-x divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="p-5">
            <div className="text-sm text-gray-500">Still pending</div>
            <div className={`mt-1 text-2xl font-bold ${pendingJobs.length > 0 ? "text-amber-700" : "text-gray-300"}`}>
              {pendingJobs.length}
            </div>
          </div>
          <div className="p-5">
            <div className="text-sm text-gray-500">Billing this month</div>
            <div className="mt-1 text-2xl font-bold text-teal">{awaitingJobs.length}</div>
          </div>
          <div className="p-5">
            <div className="text-sm text-gray-500">Billed</div>
            <div className="mt-1 text-2xl font-bold text-green-700">{billedJobs.length}</div>
          </div>
          <div className="p-5">
            <div className="text-sm text-gray-500">Deferred</div>
            <div className="mt-1 text-2xl font-bold text-gray-400">{noJobs.length}</div>
          </div>
        </div>
      )}

      {totalDue === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">No jobs scheduled for check-in yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Jobs appear here based on the &ldquo;Next billing check-in month&rdquo; set in Job Setup.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Pending ─────────────────────────────────────────── */}
          {pendingJobs.length > 0 && (
            <div className="rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-100 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Pending — {pendingJobs.length} job{pendingJobs.length !== 1 ? "s" : ""} awaiting a response
                </p>
              </div>
              <div className="bg-white divide-y divide-gray-50">
                {pendingJobs.map((job) => {
                  const isDefer = deferState?.jobId === job.id;
                  return (
                    <div key={job.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                            <Link href={`/jobs/${job.id}`} className="hover:text-teal hover:underline">
                              {job.jobName || job.jobNumber}
                            </Link>
                            <span className="text-xs font-normal text-gray-400">#{job.jobNumber}</span>
                            <PendingCoBadge count={pendingCoCounts[job.id] ?? 0} />
                            <BillingPlatformBadge platform={job.billingPlatform} />
                          </div>
                          <div className="text-xs text-gray-500">
                            {job.customer} · billing due the {job.billingDueDay}
                            {ordinal(job.billingDueDay)} of the month
                          </div>
                          <div className="mt-1.5">
                            <CompletionBar percent={metrics.get(job.id)?.percentComplete} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleYes(job)}
                            disabled={!!submitting}
                            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                          >
                            {submitting === job.id ? "Saving…" : "Yes, billing this month"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeferState(
                                isDefer ? null : { jobId: job.id, month: nextMonth(month) }
                              )
                            }
                            disabled={!!submitting}
                            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            No, defer
                          </button>
                        </div>
                      </div>

                      {/* Defer picker */}
                      {isDefer && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <span className="text-sm text-gray-600 font-medium">Check again in:</span>
                          <input
                            type="month"
                            value={deferState.month}
                            min={nextMonth(month)}
                            onChange={(e) =>
                              setDeferState({ jobId: job.id, month: e.target.value })
                            }
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                          />
                          <button
                            type="button"
                            onClick={() => handleDefer(job)}
                            disabled={!!submitting || !deferState.month}
                            className="rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
                          >
                            {submitting === job.id ? "Saving…" : "Confirm defer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeferState(null)}
                            className="text-sm text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Billing this month (confirmed, not yet submitted) ── */}
          {awaitingJobs.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                  Billing this month — {awaitingJobs.length} job{awaitingJobs.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {awaitingJobs.map(({ job }) => {
                  const days = daysUntilDue(job.billingDueDay, month);
                  const tier = urgencyTier(days);
                  const isRed = tier === "red";
                  return (
                    <div
                      key={job.id}
                      className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${
                        isRed ? "bg-red-50" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`flex flex-wrap items-center gap-2 font-semibold ${isRed ? "text-red-800" : "text-navy"}`}>
                          <Link href={`/jobs/${job.id}`} className="hover:text-teal hover:underline">
                            {job.jobName || job.jobNumber}
                          </Link>
                          <span className="text-xs font-normal text-gray-400">#{job.jobNumber}</span>
                          <PendingCoBadge count={pendingCoCounts[job.id] ?? 0} />
                          <BillingPlatformBadge platform={job.billingPlatform} />
                        </div>
                        <div className="text-xs text-gray-400">
                          {job.customer} · due the {job.billingDueDay}{ordinal(job.billingDueDay)}
                        </div>
                        <div className="mt-1.5">
                          <CompletionBar percent={metrics.get(job.id)?.percentComplete} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${URGENCY_STYLE[tier]}`}>
                          {days < 0
                            ? `Due ${-days} day${-days === 1 ? "" : "s"} ago`
                            : days === 0
                            ? "Due today"
                            : days === 1
                            ? "Due tomorrow"
                            : `${days} days`}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-teal">
                          Billing this month
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUndo(job)}
                          disabled={!!submitting}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          {submitting === job.id ? "…" : "Undo"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Billed (pay app already on file this month) ─────── */}
          {billedJobs.length > 0 && (
            <div className="rounded-2xl border border-green-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-green-50 border-b border-green-100 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Billed — {billedJobs.length} job{billedJobs.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {billedJobs.map(({ job }) => {
                  const apps = payAppsThisMonth.get(job.id) ?? [];
                  const totalBilled = apps.reduce((sum, a) => sum + a.amountBilled, 0);
                  const latestDate = apps.reduce(
                    (latest, a) => (a.applicationDate > latest ? a.applicationDate : latest),
                    apps[0]?.applicationDate ?? ""
                  );
                  return (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                          <Link href={`/jobs/${job.id}`} className="hover:text-teal hover:underline">
                            {job.jobName || job.jobNumber}
                          </Link>
                          <span className="text-xs font-normal text-gray-400">#{job.jobNumber}</span>
                          <PendingCoBadge count={pendingCoCounts[job.id] ?? 0} />
                          <BillingPlatformBadge platform={job.billingPlatform} />
                        </div>
                        <div className="text-xs text-gray-400">
                          {job.customer} · {currency.format(totalBilled)} billed {formatShortDate(latestDate)}
                        </div>
                        <div className="mt-1.5">
                          <CompletionBar percent={metrics.get(job.id)?.percentComplete} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                          Billed
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUndo(job)}
                          disabled={!!submitting}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          {submitting === job.id ? "…" : "Undo"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Deferred ─────────────────────────────────────── */}
          {noJobs.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Deferred — {noJobs.length} job{noJobs.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {noJobs.map(({ job }) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-400">
                        <Link href={`/jobs/${job.id}`} className="hover:text-teal hover:underline">
                          {job.jobName || job.jobNumber}
                        </Link>
                        <span className="text-xs font-normal text-gray-300">#{job.jobNumber}</span>
                        <PendingCoBadge count={pendingCoCounts[job.id] ?? 0} />
                        <BillingPlatformBadge platform={job.billingPlatform} />
                      </div>
                      <div className="text-xs text-gray-400">{job.customer}</div>
                      <div className="mt-1.5">
                        <CompletionBar percent={metrics.get(job.id)?.percentComplete} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.billingCheckinMonth && (
                        <span className="text-xs text-gray-400">
                          Next check-in: {formatMonth(job.billingCheckinMonth)}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                        Deferred
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUndo(job)}
                        disabled={!!submitting}
                        className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        {submitting === job.id ? "…" : "Undo"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
