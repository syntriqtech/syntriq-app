"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import {
  fetchChangeOrders,
  fetchDeletedChangeOrders,
  restoreChangeOrder,
  ChangeOrder,
  ChangeOrderStatus,
} from "@/lib/changeOrdersDb";
import { computeAllJobMetrics, JobMetrics } from "@/lib/dashboardMetrics";
import { DbJob } from "@/lib/jobs";
import ChangeOrderQuickAdd from "@/components/ChangeOrderQuickAdd";
import ChangeOrderImportModal from "@/components/ChangeOrderImportModal";
import ChangeOrderDetailModal from "@/components/ChangeOrderDetailModal";
import DonutPercent from "@/components/DonutPercent";
import JobListTable from "@/components/JobListTable";
import KpiStrip from "@/components/KpiStrip";
import { formatDate } from "@/lib/dateUtils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type FilterKey = "all" | "pending" | "approved" | "rejected";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  void: "Void",
};

const STATUS_STYLE: Record<ChangeOrderStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  void: "bg-gray-100 text-gray-400",
};

function daysAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function ageClass(days: number): string {
  if (days > 60) return "text-red-500";
  if (days > 30) return "text-amber-600";
  return "text-gray-400";
}

function numericSort(a: string, b: string): number {
  const na = parseFloat(a), nb = parseFloat(b);
  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
}

function applyFilter(cos: ChangeOrder[], filter: FilterKey): ChangeOrder[] {
  switch (filter) {
    case "pending":  return cos.filter((c) => c.status === "pending" || c.status === "submitted");
    case "approved": return cos.filter((c) => c.status === "approved");
    case "rejected": return cos.filter((c) => c.status === "rejected" || c.status === "void");
    default:         return cos;
  }
}

export default function ChangeOrdersPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const sortedJobs = [...jobs].sort((a, b) => {
    const na = parseFloat(a.jobNumber), nb = parseFloat(b.jobNumber);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.jobNumber.localeCompare(b.jobNumber);
  });

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView] = useState<"list" | "cards">("list");

  // ── List state ────────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<JobMetrics[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"jobNumber" | "percent">("jobNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [allCos, setAllCos] = useState<ChangeOrder[]>([]);

  // ── Cards state ───────────────────────────────────────────────────────────
  const [selectedJob, setSelectedJob] = useState<DbJob | null>(null);
  const [selectedJobMetrics, setSelectedJobMetrics] = useState<JobMetrics | null>(null);
  const [jobCos, setJobCos] = useState<ChangeOrder[]>([]);
  const [isLoadingCos, setIsLoadingCos] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [detailCo, setDetailCo] = useState<ChangeOrder | null>(null);
  const [deletedCos, setDeletedCos] = useState<ChangeOrder[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);

  // ── Load list metrics ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoadingJobs) return;
    if (jobs.length === 0) { setMetrics([]); return; }
    let cancelled = false;
    setIsLoadingList(true);
    computeAllJobMetrics(jobs)
      .then((m) => { if (!cancelled) setMetrics(m); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingList(false); });
    return () => { cancelled = true; };
  }, [jobs, isLoadingJobs]);

  // ── Load all-jobs change orders (for the KPI strip) — refreshed whenever
  // the list view is shown, so edits made in the per-job cards view reflect. ──
  useEffect(() => {
    if (view !== "list") return;
    let cancelled = false;
    fetchChangeOrders()
      .then((cos) => { if (!cancelled) setAllCos(cos); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [view]);

  // ── Respect ?filter= deep-links from dashboard tiles ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f === "exposure") setFilter("pending");
    else if (f === "ready") setFilter("approved");
  }, []);

  // ── Handle sessionStorage jump-to-job (from job-card CO badges) ──────────
  useEffect(() => {
    if (isLoadingJobs || jobs.length === 0) return;
    const initJob = sessionStorage.getItem("co_initial_job");
    if (initJob) {
      const target = jobs.find((j) => j.jobNumber === initJob);
      if (target) {
        sessionStorage.removeItem("co_initial_job");
        handleSelectJob(target.id);
      }
    }
  }, [isLoadingJobs, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── List handlers ─────────────────────────────────────────────────────────
  function handleSort(col: "jobNumber" | "percent") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  }

  async function handleSelectJob(jobId: string) {
    const selected = jobs.find((j) => j.id === jobId);
    if (!selected) return;
    setSelectedJob(selected);
    setSelectedJobMetrics(metrics.find((m) => m.id === jobId) ?? null);
    setJobCos([]);
    setDeletedCos([]);
    setShowDeleted(false);
    setIsLoadingCos(true);
    setView("cards");
    try {
      const cos = await fetchChangeOrders(jobId);
      setJobCos(cos);
    } catch {
      // silently fail
    } finally {
      setIsLoadingCos(false);
    }
  }

  // ── Cards handlers ────────────────────────────────────────────────────────
  function handleCreated(co: ChangeOrder) {
    setJobCos((prev) => [co, ...prev]);
    setShowQuickAdd(false);
  }

  function handleUpdated(updated: ChangeOrder) {
    setJobCos((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setDetailCo(updated);
  }

  function handleDeleted(id: string) {
    const removed = jobCos.find((c) => c.id === id);
    setJobCos((prev) => prev.filter((c) => c.id !== id));
    setDetailCo(null);
    if (removed) {
      setDeletedCos((prev) => [{ ...removed, deletedAt: new Date().toISOString() }, ...prev]);
    }
  }

  async function handleToggleDeleted() {
    if (!showDeleted && selectedJob) {
      setIsLoadingDeleted(true);
      try {
        const data = await fetchDeletedChangeOrders(selectedJob.id);
        setDeletedCos(data);
      } finally {
        setIsLoadingDeleted(false);
      }
    }
    setShowDeleted((prev) => !prev);
  }

  async function handleRestore(id: string) {
    try {
      const restored = await restoreChangeOrder(id);
      setDeletedCos((prev) => prev.filter((c) => c.id !== id));
      setJobCos((prev) => [restored, ...prev]);
    } catch {
      // silently fail
    }
  }

  function jobLabel(co: ChangeOrder): string {
    const j = jobs.find((j) => j.id === co.jobId);
    return j ? `${j.jobName || "⚠ No name"} (${j.jobNumber})` : co.jobId;
  }

  // ── List computed ─────────────────────────────────────────────────────────
  const filteredList = metrics.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.jobNumber.toLowerCase().includes(q) || r.jobName.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q);
  });

  const sortedMetrics = [...filteredList].sort((a, b) => {
    const cmp = sortBy === "jobNumber" ? numericSort(a.jobNumber, b.jobNumber) : a.percentComplete - b.percentComplete;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const isSpinning = isLoadingJobs || isLoadingList;

  const submittedCos = allCos.filter((c) => c.status === "submitted");
  const approvedCos = allCos.filter((c) => c.status === "approved");
  const amountSubmitted = submittedCos.reduce((sum, c) => sum + c.amount, 0);
  const amountApproved = approvedCos.reduce((sum, c) => sum + c.amount, 0);
  const billedChangeOrders = metrics.reduce((sum, m) => sum + m.changeOrderBilledToDate, 0);

  const coKpiItems = [
    {
      label: "Active projects",
      value: isSpinning ? "—" : String(jobs.length),
      delta: `${jobs.length} job${jobs.length === 1 ? "" : "s"} total`,
      direction: "plain" as const,
    },
    {
      label: "Amount submitted",
      value: isSpinning ? "—" : currencyShort.format(amountSubmitted),
      delta: `${submittedCos.length} change order${submittedCos.length === 1 ? "" : "s"}`,
      direction: "plain" as const,
    },
    {
      label: "Amount approved",
      value: isSpinning ? "—" : currencyShort.format(amountApproved),
      delta: `${approvedCos.length} change order${approvedCos.length === 1 ? "" : "s"}`,
      direction: "plain" as const,
    },
    {
      label: "Billed",
      value: isSpinning ? "—" : currencyShort.format(billedChangeOrders),
      delta: amountApproved > 0 ? `${Math.round((billedChangeOrders / amountApproved) * 100)}% of approved` : "no approved COs yet",
      direction: "plain" as const,
    },
  ];

  // ── Cards computed ────────────────────────────────────────────────────────
  const filteredCos = applyFilter(jobCos, filter);
  const pendingCount = jobCos.filter((c) => c.status === "pending" || c.status === "submitted").length;
  const approvedCount = jobCos.filter((c) => c.status === "approved").length;
  const netCOValue = jobCos.filter((c) => c.status === "approved").reduce((sum, c) => sum + c.amount, 0);
  const originalContract = selectedJob?.contractValue ?? 0;
  const revisedContract = originalContract + netCOValue;

  // ══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "list") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Change Orders</h1>
          <p className="mt-1 text-sm text-gray-500">Select a job to view and manage its change orders.</p>
        </div>

        <KpiStrip items={coKpiItems} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:w-72">
            <input
              type="search"
              placeholder="Search by job #, name, or GC…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy placeholder:text-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Sort:</span>
            <button
              type="button"
              onClick={() => handleSort("jobNumber")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${sortBy === "jobNumber" ? "bg-teal text-white" : "border border-gray-200 text-navy hover:bg-gray-50"}`}
            >
              Job #{sortBy === "jobNumber" && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("percent")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${sortBy === "percent" ? "bg-teal text-white" : "border border-gray-200 text-navy hover:bg-gray-50"}`}
            >
              % Complete{sortBy === "percent" && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
          </div>
        </div>

        <JobListTable
          metrics={sortedMetrics}
          jobs={jobs}
          isSpinning={isSpinning}
          onSelectJob={handleSelectJob}
          emptyMessage={search ? "No jobs match your search." : "No jobs yet — add one in Job Setup."}
          showCoCountColumn
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CARDS VIEW — change orders for the selected job
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-6">
      {/* Back navigation */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => setView("list")}
            className="mb-1 text-sm font-medium text-teal hover:underline"
          >
            ← All Jobs
          </button>
          <h1 className="text-2xl font-bold text-navy">Change Orders</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10"
        >
          Import Change Order (AI)
        </button>
      </div>

      {/* Job header strip */}
      {selectedJob && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Job {selectedJob.jobNumber}
              </p>
              <h2 className="mt-0.5 truncate text-xl font-bold text-navy">
                {selectedJob.jobName || "—"}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">{selectedJob.customer}</p>
            </div>
            {selectedJobMetrics && (
              <DonutPercent percent={selectedJobMetrics.percentComplete} size={64} />
            )}
          </div>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-50 pt-4">
            <div>
              <p className="text-xs text-gray-400">Original contract</p>
              <p className="mt-0.5 font-semibold text-navy">{currencyShort.format(originalContract)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Net change orders</p>
              <p className={`mt-0.5 font-semibold ${netCOValue >= 0 ? "text-navy" : "text-red-600"}`}>
                {netCOValue >= 0 ? "+" : ""}{currencyShort.format(netCOValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Revised contract</p>
              <p className="mt-0.5 font-semibold text-navy">{currencyShort.format(revisedContract)}</p>
            </div>
          </div>

          {/* Summary pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {pendingCount} Pending
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {approvedCount} Approved
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-xs font-semibold text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              Net {netCOValue >= 0 ? "+" : ""}{currencyShort.format(netCOValue)}
            </span>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-navy text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-navy"
            }`}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {/* CO cards grid */}
      {isLoadingCos ? (
        <p className="text-sm text-gray-500">Loading change orders…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Existing CO cards */}
          {filteredCos.map((co) => {
            const displayId = co.coNumber ?? co.pcoNumber ?? "—";
            const amountColor = co.amount < 0 ? "text-red-600" : "text-navy";
            const ageDateStr = co.dateSubmitted ?? co.createdAt;
            const days = daysAgo(ageDateStr);
            const isPending = co.status === "pending" || co.status === "submitted";
            const isApprovedApplied = co.status === "approved" && !!co.appliedAt;
            const isApprovedReady = co.status === "approved" && !co.appliedAt;
            const displayDate = co.dateApproved ?? co.dateSubmitted ?? co.createdAt;

            return (
              <button
                key={co.id}
                type="button"
                onClick={() => setDetailCo(co)}
                className="group text-left rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:border-teal/40 hover:shadow-md flex flex-col"
              >
                {/* Card body */}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-navy">{displayId}</span>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[co.status]}`}>
                      {STATUS_LABEL[co.status]}
                    </span>
                  </div>

                  <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
                    {co.description || <span className="text-gray-400 italic">No description</span>}
                  </p>

                  <div className="mt-auto">
                    <p className={`text-lg font-bold tabular-nums ${amountColor}`}>
                      {co.amount >= 0 ? "+" : ""}{currency.format(co.amount)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{formatDate(displayDate)}</p>
                  </div>
                </div>

                {/* Card footer */}
                <div className={`rounded-b-2xl border-t px-5 py-2.5 text-xs font-medium ${
                  isPending
                    ? `border-gray-100 ${ageClass(days)}`
                    : isApprovedApplied
                    ? "border-green-100 bg-green-50 text-green-700"
                    : isApprovedReady
                    ? "border-amber-100 bg-amber-50 text-amber-700"
                    : "border-gray-100 text-gray-400"
                }`}>
                  {isPending && (
                    <>
                      {days === 0 ? "Submitted today" : `${days} day${days === 1 ? "" : "s"} pending`}
                    </>
                  )}
                  {isApprovedApplied && "✓ Applied to SOV"}
                  {isApprovedReady && "→ Ready to apply to SOV"}
                  {(co.status === "rejected" || co.status === "void") && (
                    co.status === "void" ? "Voided" : "Rejected"
                  )}
                </div>
              </button>
            );
          })}

          {/* Empty state for non-"all" filters */}
          {filteredCos.length === 0 && filter !== "all" && (
            <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
              <p className="text-sm text-gray-400">No {FILTER_LABELS[filter].toLowerCase()} change orders for this job.</p>
            </div>
          )}

          {/* + New change order card — always visible */}
          <button
            type="button"
            onClick={() => setShowQuickAdd(true)}
            className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-5 transition-all hover:border-teal/50 hover:bg-teal/5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal/10 text-xl font-light text-teal">
              +
            </div>
            <div className="text-center">
              <p className="font-semibold text-navy">New Change Order</p>
              <p className="mt-0.5 text-xs text-gray-400">for {selectedJob?.jobName || selectedJob?.jobNumber}</p>
            </div>
          </button>
        </div>
      )}

      {/* Recently Deleted */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleToggleDeleted}
          className="text-sm font-medium text-gray-400 hover:text-navy transition-colors"
        >
          {showDeleted ? "▾" : "▸"} Recently deleted
          {deletedCos.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-400">({deletedCos.length})</span>
          )}
        </button>

        {showDeleted && (
          <div className="mt-3">
            {isLoadingDeleted ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : deletedCos.length === 0 ? (
              <p className="text-sm text-gray-400">No recently deleted change orders.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3">CO #</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {deletedCos.map((co) => (
                      <tr key={co.id} className="text-gray-400">
                        <td className="px-4 py-3 font-mono">{co.coNumber ?? co.pcoNumber ?? "—"}</td>
                        <td className="max-w-xs px-4 py-3">
                          <span className="line-clamp-1">{co.description || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{currency.format(co.amount)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRestore(co.id)}
                            className="text-xs font-semibold text-teal hover:underline"
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && jobs.length > 0 && (
        <ChangeOrderQuickAdd
          jobs={jobs}
          defaultJobId={selectedJob?.id}
          onClose={() => setShowQuickAdd(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Import Change Order (AI) Modal */}
      {showImport && (
        <ChangeOrderImportModal
          jobs={jobs}
          onClose={() => setShowImport(false)}
          onCreated={(co) => {
            handleCreated(co);
            setShowImport(false);
          }}
        />
      )}

      {/* Detail Modal */}
      {detailCo && (
        <ChangeOrderDetailModal
          co={detailCo}
          jobLabel={jobLabel(detailCo)}
          onClose={() => setDetailCo(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
