"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useJobs } from "@/hooks/useJobs";
import { computeJobBillingRows, JobBillingRow } from "@/lib/billingSummary";
import {
  fetchAllPayApplications,
  fetchPayApplicationsByJob,
  markApplicationBilled,
  PayApplication,
} from "@/lib/payApplicationsDb";
import { fetchPayAppPayments } from "@/lib/payAppPaymentsDb";
import { fetchChangeOrders } from "@/lib/changeOrdersDb";
import { STATUS_LABEL, STATUS_BADGE_STYLE } from "@/lib/payApplicationStatusUi";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { formatDate } from "@/lib/dateUtils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function numericSort(a: string, b: string): number {
  const na = parseFloat(a), nb = parseFloat(b);
  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
}

// ── Types ────────────────────────────────────────────────────────────────────

type PayAppWithStatus = PayApplication & {
  totalPaid: number;
  paymentStatus: "Unpaid" | "Partial" | "Paid";
};

type ExpandState = Record<string, PayAppWithStatus[] | "loading">;

type JobSummary = JobBillingRow & {
  lastAppNumber: string | null;
  appCount: number;
  pendingCoCount: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function BilledProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const isComplete = pct >= 99.9;
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${isComplete ? "bg-green-500" : "bg-teal"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={`w-12 text-right text-xs font-semibold tabular-nums ${isComplete ? "text-green-700" : "text-navy"}`}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PayApplicationsPage() {
  const router = useRouter();
  const { jobs, isLoading: isLoadingJobs, setJobs } = useJobs();
  const [summaries, setSummaries] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandState>({});
  const [sortBy, setSortBy] = useState<"jobNumber" | "customer">("jobNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [applicationNumber, setApplicationNumber] = useState("");
  const [applicationDate, setApplicationDate] = useState(todayIsoDate());
  const [periodTo, setPeriodTo] = useState(todayIsoDate());
  const [amountBilled, setAmountBilled] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    if (isLoadingJobs) return;
    if (jobs.length === 0) { setIsLoading(false); return; }

    let cancelled = false;
    setIsLoading(true);

    Promise.all([computeJobBillingRows(jobs), fetchAllPayApplications(), fetchChangeOrders()])
      .then(([billingRows, allApps, allCos]) => {
        if (cancelled) return;

        // Group apps by job to find last app number + count
        const appsByJob = new Map<string, PayApplication[]>();
        for (const app of allApps) {
          if (!appsByJob.has(app.jobId)) appsByJob.set(app.jobId, []);
          appsByJob.get(app.jobId)!.push(app);
        }

        // Pending/submitted (not yet approved) change orders, per job —
        // same "pending" definition used by the Change Orders page itself.
        const pendingCoCountByJob = new Map<string, number>();
        for (const co of allCos) {
          if (co.status !== "pending" && co.status !== "submitted") continue;
          pendingCoCountByJob.set(co.jobId, (pendingCoCountByJob.get(co.jobId) ?? 0) + 1);
        }

        const merged: JobSummary[] = billingRows.map((row) => {
          const jobApps = appsByJob.get(row.jobId) ?? [];
          const sorted = [...jobApps].sort((a, b) =>
            numericSort(a.applicationNumber, b.applicationNumber)
          );
          const last = sorted[sorted.length - 1] ?? null;
          return {
            ...row,
            lastAppNumber: last?.applicationNumber ?? null,
            appCount: sorted.length,
            pendingCoCount: pendingCoCountByJob.get(row.jobId) ?? 0,
          };
        });

        setSummaries(merged);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load pay applications.");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }

  useEffect(() => { load(); }, [jobs, isLoadingJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to a specific job (e.g. from the Dashboard's Open AR widget) and auto-expand it.
  useEffect(() => {
    if (isLoadingJobs || jobs.length === 0 || summaries.length === 0) return;
    const initJobNumber = sessionStorage.getItem("pay_initial_job");
    if (!initJobNumber) return;
    sessionStorage.removeItem("pay_initial_job");
    const target = jobs.find((j) => j.jobNumber === initJobNumber);
    if (!target) return;
    handleToggle(target.id);
    requestAnimationFrame(() => {
      document.getElementById(`job-row-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [isLoadingJobs, jobs, summaries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort
  function handleSort(col: "jobNumber" | "customer") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  }

  const sortedSummaries = [...summaries].sort((a, b) => {
    const cmp = sortBy === "jobNumber"
      ? numericSort(a.jobNumber, b.jobNumber)
      : a.customer.localeCompare(b.customer);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Expand/collapse per job (independent, lazy-loaded)
  async function handleToggle(jobId: string) {
    if (expanded[jobId]) {
      setExpanded((prev) => { const next = { ...prev }; delete next[jobId]; return next; });
      return;
    }
    setExpanded((prev) => ({ ...prev, [jobId]: "loading" }));
    try {
      const apps = await fetchPayApplicationsByJob(jobId);
      const withStatus: PayAppWithStatus[] = await Promise.all(
        apps.map(async (app) => {
          const payments = await fetchPayAppPayments(app.id);
          const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
          const paymentStatus: PayAppWithStatus["paymentStatus"] =
            totalPaid <= 0 ? "Unpaid" : totalPaid < app.currentPaymentDue - 0.01 ? "Partial" : "Paid";
          return { ...app, totalPaid, paymentStatus };
        })
      );
      setExpanded((prev) => ({ ...prev, [jobId]: withStatus }));
    } catch {
      setExpanded((prev) => { const next = { ...prev }; delete next[jobId]; return next; });
    }
  }

  // Navigate to Change Orders, scoped to this job and filtered to pending
  function handleViewPendingCos(jobNumber: string) {
    sessionStorage.setItem("co_initial_job", jobNumber);
    router.push("/change-orders?filter=exposure");
  }

  // Navigate to SOV to start a new pay application for the given job
  function handleCreatePayApp(jobId?: string) {
    if (jobId) {
      const job = jobs.find((j) => j.id === jobId);
      if (job) sessionStorage.setItem("sov_initial_job", job.jobNumber);
    }
    sessionStorage.setItem("sov_start_next_app", "1");
    router.push("/sov");
  }

  // Legacy create form (kept for data entry edge cases)
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJobId || !applicationNumber || !amountBilled) return;
    setCreateError(null);
    setIsCreating(true);
    try {
      await markApplicationBilled(
        selectedJobId,
        applicationNumber,
        applicationDate,
        periodTo,
        Number(amountBilled) || 0
      );
      setShowCreateForm(false);
      setSelectedJobId("");
      setApplicationNumber("");
      setApplicationDate(todayIsoDate());
      setPeriodTo(todayIsoDate());
      setAmountBilled("");
      // Reload summaries and clear any cached expanded state for the job
      setExpanded({});
      load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create pay application.");
    } finally {
      setIsCreating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Record Payment</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track billing progress and payment status by job.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            // Use the single expanded job's context if exactly one is open
            const expandedIds = Object.keys(expanded);
            handleCreatePayApp(expandedIds.length === 1 ? expandedIds[0] : undefined);
          }}
          className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10"
        >
          + Create Pay Application
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Create form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-bold text-navy mb-4">Create Pay Application</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="jobSelect" className="text-sm font-medium text-navy">
                Job
              </label>
              <select
                id="jobSelect"
                required
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
              >
                <option value="">Select a job…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNumber}{job.jobName ? ` · ${job.jobName}` : ""} — {job.customer}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Application #"
              id="appNumber"
              required
              value={applicationNumber}
              onChange={(e) => setApplicationNumber(e.target.value)}
            />
            <TextField
              label="Application date"
              id="appDate"
              type="date"
              required
              value={applicationDate}
              onChange={(e) => setApplicationDate(e.target.value)}
            />
            <TextField
              label="Period to"
              id="periodTo"
              type="date"
              required
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
            <TextField
              label="Amount billed"
              id="amountBilled"
              type="number"
              min="0"
              step="0.01"
              required
              value={amountBilled}
              onChange={(e) => setAmountBilled(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>
          {createError && <p className="mt-3 text-sm text-red-600">{createError}</p>}
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={isCreating} className="w-auto px-6">
              {isCreating ? "Creating…" : "Create"}
            </Button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              disabled={isCreating}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Job list */}
      {(isLoading || isLoadingJobs) ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-400">Loading pay applications…</p>
        </div>
      ) : summaries.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">No pay applications yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Create a pay application above, or build one from the Schedule of Values.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

          {/* Sort controls */}
          <div className="flex items-center gap-1 border-b border-gray-100 px-5 py-3">
            <span className="text-xs font-medium text-gray-400 mr-2">Sort by:</span>
            {(["jobNumber", "customer"] as const).map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => handleSort(col)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  sortBy === col
                    ? "bg-navy text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {col === "jobNumber" ? "Job #" : "Customer"}
                {sortBy === col && (
                  <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400">
              {summaries.length} job{summaries.length !== 1 ? "s" : ""} ·{" "}
              {summaries.reduce((s, r) => s + r.appCount, 0)} application{summaries.reduce((s, r) => s + r.appCount, 0) !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Job rows */}
          <div className="divide-y divide-gray-50">
            {sortedSummaries.map((row) => {
              const isExpanded = !!expanded[row.jobId] && expanded[row.jobId] !== "loading";
              const isLoading = expanded[row.jobId] === "loading";
              const apps = isExpanded ? (expanded[row.jobId] as PayAppWithStatus[]) : [];

              return (
                <div key={row.jobId} id={`job-row-${row.jobId}`}>
                  {/* ── Summary row (collapsed) ─────────────────── */}
                  <button
                    type="button"
                    onClick={() => handleToggle(row.jobId)}
                    className="w-full px-5 py-4 flex flex-wrap items-center gap-4 text-left hover:bg-gray-50/70 transition-colors"
                  >
                    {/* Job identity */}
                    <div className="min-w-[160px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-navy">
                          {row.jobName || <span className="text-amber-600">⚠ No name</span>}
                        </span>
                        <span className="text-xs text-gray-400 font-normal">#{row.jobNumber}</span>
                        {row.pendingCoCount > 0 && (
                          <span
                            role="button"
                            tabIndex={0}
                            title={`${row.pendingCoCount} pending change order${row.pendingCoCount !== 1 ? "s" : ""} — view`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewPendingCos(row.jobNumber);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                handleViewPendingCos(row.jobNumber);
                              }
                            }}
                            className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 py-0.5 text-[10px] font-bold text-white hover:bg-amber-500"
                          >
                            {row.pendingCoCount}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">{row.customer}</div>
                    </div>

                    {/* Progress bar + billed % */}
                    <div className="w-56 flex-none">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                          Billed
                        </span>
                        <span className="text-[10px] text-gray-400">
                          of {currencyShort.format(row.revisedContractValue)}
                        </span>
                      </div>
                      <BilledProgressBar pct={row.percentBilled} />
                    </div>

                    {/* Quick stats */}
                    <div className="flex items-center gap-5 flex-none text-right">
                      <div>
                        <div className="text-sm font-bold text-navy tabular-nums">
                          {currencyShort.format(row.billedToDate)}
                        </div>
                        <div className="text-[10px] text-gray-400">billed to date</div>
                      </div>
                      <div>
                        {row.lastBillingDate ? (
                          <>
                            <div className="text-sm font-semibold text-gray-600">
                              App #{row.lastAppNumber}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {formatDate(row.lastBillingDate)}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-gray-300">No apps yet</div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">{row.appCount}</div>
                        <div className="text-[10px] text-gray-400">
                          app{row.appCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Chevron */}
                    <span className="flex-none text-gray-300 text-sm">
                      {isLoading ? "…" : isExpanded ? "▴" : "▾"}
                    </span>
                  </button>

                  {/* ── Expanded apps sub-table ─────────────────── */}
                  {(isExpanded || isLoading) && (
                    <div className="bg-gray-50/60 border-t border-gray-100 px-5 pb-4 pt-3">
                      {isLoading ? (
                        <p className="text-xs text-gray-400 py-3">Loading applications…</p>
                      ) : apps.length === 0 ? (
                        <div className="flex items-center justify-between py-3">
                          <p className="text-xs text-gray-400">No pay applications recorded for this job.</p>
                          <button
                            type="button"
                            onClick={() => handleCreatePayApp(row.jobId)}
                            className="text-xs font-semibold text-teal hover:underline"
                          >
                            Start first pay app →
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                <th className="px-4 py-2.5">App #</th>
                                <th className="px-4 py-2.5">Date</th>
                                <th className="px-4 py-2.5">Period To</th>
                                <th className="px-4 py-2.5 text-right">Billed to Date</th>
                                <th className="px-4 py-2.5 text-right">This Period Due</th>
                                <th className="px-4 py-2.5 text-right">Received</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {apps.map((app) => (
                                <tr key={app.id} className="bg-white">
                                  <td className="px-4 py-2.5 font-semibold text-navy">
                                    #{app.applicationNumber}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-600">
                                    {formatDate(app.applicationDate)}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-500">
                                    {formatDate(app.periodTo)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy">
                                    {currency.format(app.amountBilled)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                    {currency.format(app.currentPaymentDue)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700">
                                    {app.totalPaid > 0 ? currency.format(app.totalPaid) : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_STYLE[app.status]}`}>
                                      {STATUS_LABEL[app.status]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                      {app.pdfUrl && (
                                        <a
                                          href={app.pdfUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-semibold text-gray-400 hover:text-teal"
                                          title="Download saved PDF"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          ↓ PDF
                                        </a>
                                      )}
                                      <Link
                                        href={`/pay-applications/${app.id}`}
                                        className="font-semibold text-teal hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View →
                                      </Link>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleCreatePayApp(row.jobId)}
                            className="text-xs font-semibold text-teal hover:underline"
                          >
                            + New pay app →
                          </button>
                        </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
