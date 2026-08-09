"use client";

import { Fragment, useEffect, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { DbJob } from "@/lib/jobs";
import { computeJobBillingRows } from "@/lib/billingSummary";
import {
  billingRowToRetentionRow,
  computeRetentionSummary,
  RetentionRow,
  RetentionSummary,
} from "@/lib/retentionData";
import {
  fetchAllRetentionReleases,
  recordRetentionPayment,
  undoRetentionPayment,
  RetentionRelease,
} from "@/lib/retentionReleasesDb";
import { verifyJobPayments, UnpaidApp, UnpaidRelease } from "@/lib/jobPaymentVerification";
import RetentionReleaseWizard from "@/components/RetentionReleaseWizard";
import FundingQuestionnaireModal from "@/components/FundingQuestionnaireModal";
import { formatDate } from "@/lib/dateUtils";
import Link from "next/link";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const currencyFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

const STATUS_STYLE: Record<string, string> = {
  held: "bg-gray-100 text-gray-500",
  ready_to_bill: "bg-amber-100 text-amber-800",
  partial_released: "bg-blue-100 text-blue-700",
  fully_released: "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<string, string> = {
  held: "Held",
  ready_to_bill: "Ready to Bill",
  partial_released: "Partial Release",
  fully_released: "Fully Released",
};

type ModalState = {
  row: RetentionRow;
  job: DbJob;
};

type MarkPaidState = {
  release: RetentionRelease;
  jobRow: RetentionRow;
};

type MarkPaidStage =
  | { kind: "verifying" }
  | { kind: "form" }
  | { kind: "blocked"; unpaidApps: UnpaidApp[]; unpaidReleases: UnpaidRelease[] }
  | { kind: "override"; unpaidApps: UnpaidApp[]; unpaidReleases: UnpaidRelease[] };

export default function RetentionPage() {
  const { jobs, isLoading: isLoadingJobs, reload: reloadJobs } = useJobs();
  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [summary, setSummary] = useState<RetentionSummary>({
    totalHeld: 0,
    totalReleased: 0,
    totalRemaining: 0,
    readyToBillCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [markPaid, setMarkPaid] = useState<MarkPaidState | null>(null);
  const [markPaidStage, setMarkPaidStage] = useState<MarkPaidStage>({ kind: "verifying" });
  const [overrideChecked, setOverrideChecked] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [fundingModal, setFundingModal] = useState<DbJob | null>(null);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  function load() {
    if (isLoadingJobs) return;
    if (jobs.length === 0) { setIsLoading(false); return; }

    let cancelled = false;
    setIsLoading(true);

    Promise.all([computeJobBillingRows(jobs), fetchAllRetentionReleases()])
      .then(([billingRows, allReleases]) => {
        if (cancelled) return;

        // Group releases by jobId
        const releasesByJob = new Map<string, RetentionRelease[]>();
        for (const rel of allReleases) {
          if (!releasesByJob.has(rel.jobId)) releasesByJob.set(rel.jobId, []);
          releasesByJob.get(rel.jobId)!.push(rel);
        }

        const retentionRows = billingRows
          .map((br) => billingRowToRetentionRow(br, releasesByJob.get(br.jobId) ?? []))
          .filter((r) => r.retentionHeld > 0 || r.releases.length > 0)
          .sort((a, b) => {
            const order = ["ready_to_bill", "partial_released", "held", "fully_released"];
            const oa = order.indexOf(a.status), ob = order.indexOf(b.status);
            if (oa !== ob) return oa - ob;
            return b.retentionHeld - a.retentionHeld;
          });

        setRows(retentionRows);
        const computed = computeRetentionSummary(retentionRows);
        setSummary(computed);
        window.dispatchEvent(new CustomEvent("syntriq:retention-updated"));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load retention data.");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }

  useEffect(load, [jobs, isLoadingJobs]);

  async function openMarkPaid(release: RetentionRelease, jobRow: RetentionRow) {
    setMarkPaid({ release, jobRow });
    setMarkPaidStage({ kind: "verifying" });
    setOverrideChecked(false);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentAmount("");
    setPaymentReference("");
    try {
      const result = await verifyJobPayments(jobRow.jobId, release.id);
      if (result.ok) {
        setMarkPaidStage({ kind: "form" });
      } else {
        setMarkPaidStage({ kind: "blocked", unpaidApps: result.unpaidApps, unpaidReleases: result.unpaidReleases });
      }
    } catch {
      // If verification itself fails, fall through to the form so the user isn't blocked
      setMarkPaidStage({ kind: "form" });
    }
  }

  function closeMarkPaid() {
    setMarkPaid(null);
    setPaymentAmount("");
    setPaymentReference("");
    setOverrideChecked(false);
  }

  async function handleMarkPaid(isOverride = false) {
    if (!markPaid) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;
    setIsSavingPayment(true);

    let overrideNote: string | undefined;
    if (isOverride && markPaidStage.kind === "override") {
      const outstandingApps = markPaidStage.unpaidApps.map(
        (u) => `Pay App #${u.app.applicationNumber} ($${u.outstanding.toFixed(2)} outstanding)`
      );
      const outstandingRels = markPaidStage.unpaidReleases.map(
        (u) => `Release #${u.release.releaseNumber} ($${u.outstanding.toFixed(2)} outstanding)`
      );
      overrideNote = [...outstandingApps, ...outstandingRels].join("; ");
    }

    try {
      const updated = await recordRetentionPayment(markPaid.release.id, amt, paymentDate, paymentReference, overrideNote);
      const paidJob = jobs.find((j) => j.id === markPaid.jobRow.jobId) ?? null;
      closeMarkPaid();
      load();
      if (updated.status === "paid" && paidJob) {
        setFundingModal(paidJob);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not record payment.");
    } finally {
      setIsSavingPayment(false);
    }
  }

  async function handleUndoPayment(releaseId: string) {
    setIsUndoing(true);
    try {
      await undoRetentionPayment(releaseId);
      setConfirmUndoId(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not undo payment.");
    } finally {
      setIsUndoing(false);
    }
  }

  if (isLoading || isLoadingJobs) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Retention</h1>
        <p className="text-sm text-gray-500">Loading retention data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Retention</h1>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Retention</h1>
        <p className="mt-1 text-sm text-gray-500">
          Retainage held and released across all active jobs.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <div className="text-sm text-gray-500">Total held</div>
          <div className="mt-1 text-2xl font-bold text-navy">{currency.format(summary.totalHeld)}</div>
          <div className="mt-2 text-sm text-gray-400">across {rows.length} job{rows.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="p-5">
          <div className="text-sm text-gray-500">Available to release</div>
          <div className="mt-1 text-2xl font-bold text-navy">{currency.format(summary.totalRemaining)}</div>
          <div className="mt-2 text-sm text-gray-400">total remaining</div>
        </div>
        <div className="p-5">
          <div className="text-sm text-gray-500">Ready to bill</div>
          <div className={`mt-1 text-2xl font-bold ${summary.readyToBillCount > 0 ? "text-amber-700" : "text-navy"}`}>
            {summary.readyToBillCount}
          </div>
          <div className="mt-2 text-sm text-gray-400">
            {summary.readyToBillCount === 0 ? "No jobs at 100% yet" : `job${summary.readyToBillCount !== 1 ? "s" : ""} at 100%`}
          </div>
        </div>
        <div className="p-5">
          <div className="text-sm text-gray-500">Released</div>
          <div className="mt-1 text-2xl font-bold text-green-700">{currency.format(summary.totalReleased)}</div>
          <div className="mt-2 text-sm text-gray-400">billed or paid out</div>
        </div>
      </div>

      {/* Ready-to-Bill callout */}
      {summary.readyToBillCount > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
          <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
            {summary.readyToBillCount}
          </span>
          <p className="text-sm font-semibold text-amber-900">
            {summary.readyToBillCount === 1
              ? "1 job is at 100% complete — click Bill Retention to generate a release bill."
              : `${summary.readyToBillCount} jobs are at 100% complete — click Bill Retention to generate a release bill.`}
          </p>
        </div>
      )}

      {/* Job list */}
      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-400 text-sm">No retention data yet.</p>
          <p className="mt-1 text-xs text-gray-400">Retention appears here once jobs have SOV data saved.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">GC</th>
                <th className="px-5 py-3 text-right">Contract Sum</th>
                <th className="px-5 py-3 text-right">Retention Held</th>
                <th className="px-5 py-3 text-right">Released</th>
                <th className="px-5 py-3 text-right">Remaining</th>
                <th className="px-5 py-3 text-right">% Billed</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => (
                <Fragment key={row.jobId}>
                  <tr
                    className={
                      row.status === "ready_to_bill" ? "bg-amber-50/40" :
                      row.status === "fully_released" ? "bg-green-50/30" : undefined
                    }
                  >
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => setExpandedJobId(expandedJobId === row.jobId ? null : row.jobId)}
                        className="font-semibold text-navy hover:text-teal text-left flex items-center gap-1"
                      >
                        <span>{row.jobName || <span className="text-amber-600">⚠ No name</span>}</span>
                        <span className="text-xs text-gray-400 font-normal">#{row.jobNumber}</span>
                        {row.releases.length > 0 && (
                          <span className="text-xs text-gray-400 font-normal">
                            ({row.releases.length} release{row.releases.length !== 1 ? "s" : ""})
                            {expandedJobId === row.jobId ? " ▴" : " ▾"}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-navy">{row.customer}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-navy">
                      {currency.format(row.contractSum)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-navy">
                      {currency.format(row.retentionHeld)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-green-700 font-semibold">
                      {row.totalReleased > 0 ? currency.format(row.totalReleased) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-navy">
                      {currency.format(row.remaining)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">
                      {pct.format(row.percentBilled / 100)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status] ?? ""}`}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {row.status === "fully_released" ? (
                        <span className="text-xs text-gray-400">Fully released</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const fullJob = jobs.find((j) => j.id === row.jobId);
                            if (fullJob) setModal({ row, job: fullJob });
                          }}
                          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal/90"
                        >
                          Bill Retention
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Expanded release history */}
                  {expandedJobId === row.jobId && row.releases.length > 0 && (
                    <tr key={`${row.jobId}-releases`} className="bg-gray-50/70">
                      <td colSpan={9} className="px-8 pb-4 pt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Release History</p>
                        <div className="rounded-xl border border-gray-100 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wide text-[10px]">
                                <th className="px-4 py-2 text-left">Release #</th>
                                <th className="px-4 py-2 text-left">Date</th>
                                <th className="px-4 py-2 text-left">Type</th>
                                <th className="px-4 py-2 text-right">Amount</th>
                                <th className="px-4 py-2 text-right">Paid</th>
                                <th className="px-4 py-2 text-left">Status</th>
                                <th className="px-4 py-2"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {row.releases.map((rel) => (
                                <tr key={rel.id} className="bg-white">
                                  <td className="px-4 py-2 font-semibold text-navy">#{rel.releaseNumber}</td>
                                  <td className="px-4 py-2 text-gray-600">{formatDate(rel.releaseDate)}</td>
                                  <td className="px-4 py-2 text-gray-600">{rel.isFinal ? "Final" : "Partial"}</td>
                                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-navy">{currencyFull.format(rel.amountReleased)}</td>
                                  <td className="px-4 py-2 text-right tabular-nums text-green-700">
                                    {rel.amountPaid > 0 ? (
                                      <div className="flex flex-col items-end gap-0.5">
                                        <span>{currencyFull.format(rel.amountPaid)}</span>
                                        {rel.paymentReference && (
                                          <span className="text-[10px] font-normal text-gray-400 tabular-nums">
                                            Ref: {rel.paymentReference}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      rel.status === "paid" ? "bg-green-100 text-green-700" :
                                      rel.status === "billed" ? "bg-blue-100 text-blue-700" :
                                      "bg-gray-100 text-gray-500"
                                    }`}>
                                      {rel.status === "paid" ? "Paid" : rel.status === "billed" ? "Billed" : "Draft"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">
                                    {rel.status === "billed" && (
                                      <button
                                        type="button"
                                        onClick={() => openMarkPaid(rel, row)}
                                        className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700 hover:bg-green-100"
                                      >
                                        Mark Paid
                                      </button>
                                    )}
                                    {rel.status === "paid" && (
                                      confirmUndoId === rel.id ? (
                                        <span className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-gray-500">Undo payment?</span>
                                          <button
                                            type="button"
                                            onClick={() => handleUndoPayment(rel.id)}
                                            disabled={isUndoing}
                                            className="text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                                          >
                                            {isUndoing ? "…" : "Yes"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmUndoId(null)}
                                            className="text-[10px] font-semibold text-gray-400 hover:underline"
                                          >
                                            Cancel
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmUndoId(rel.id)}
                                          className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-100"
                                        >
                                          Undo
                                        </button>
                                      )
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Retention Release Wizard */}
      {modal && (
        <RetentionReleaseWizard
          job={modal.job}
          retentionHeld={modal.row.retentionHeld}
          previouslyReleased={modal.row.totalReleased}
          remaining={modal.row.remaining}
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {/* Funding questionnaire — shown when a retention payment is marked fully paid */}
      {fundingModal && (
        <FundingQuestionnaireModal
          job={fundingModal}
          onClose={() => setFundingModal(null)}
          onArchived={() => {
            setFundingModal(null);
            reloadJobs();
          }}
        />
      )}

      {/* Mark Paid modal */}
      {markPaid && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={markPaidStage.kind === "verifying" ? undefined : closeMarkPaid}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-navy">Record Retention Payment</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Release #{markPaid.release.releaseNumber} · {markPaid.jobRow.jobName || markPaid.jobRow.jobNumber}
                </p>
              </div>
              {markPaidStage.kind !== "verifying" && (
                <button type="button" onClick={closeMarkPaid} className="mt-0.5 text-xl leading-none text-gray-400 hover:text-gray-600">×</button>
              )}
            </div>

            <div className="px-6 py-5">

              {/* ── Verifying ── */}
              {markPaidStage.kind === "verifying" && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-teal" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-navy">Checking other payments…</p>
                    <p className="mt-1 text-xs text-gray-500">Verifying all pay applications and retention releases for this job.</p>
                  </div>
                </div>
              )}

              {/* ── Blocked ── */}
              {(markPaidStage.kind === "blocked" || markPaidStage.kind === "override") && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">Other payments are still outstanding</p>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                      Before marking this retention payment as paid, the following items on this job need to be
                      resolved. Go record those payments first, then come back.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 max-h-52 overflow-y-auto">
                    {markPaidStage.unpaidApps.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pay applications — not fully paid</p>
                        <div className="flex flex-col gap-1.5">
                          {markPaidStage.unpaidApps.map(({ app, outstanding }) => (
                            <div key={app.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-navy">Pay App #{app.applicationNumber}</p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(app.applicationDate)} ·{" "}
                                  <span className="font-medium text-red-600">{currencyFull.format(outstanding)} outstanding</span>
                                </p>
                              </div>
                              <Link
                                href={`/pay-applications/${app.id}`}
                                onClick={closeMarkPaid}
                                className="flex-none rounded-lg border border-teal/30 px-2.5 py-1 text-[10px] font-semibold text-teal hover:bg-teal/5"
                              >
                                Record →
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {markPaidStage.unpaidReleases.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Retention releases — not fully paid</p>
                        <div className="flex flex-col gap-1.5">
                          {markPaidStage.unpaidReleases.map(({ release, outstanding }) => (
                            <div key={release.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-navy">Release #{release.releaseNumber}</p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(release.releaseDate)} ·{" "}
                                  <span className="font-medium text-red-600">{currencyFull.format(outstanding)} outstanding</span>
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => { closeMarkPaid(); }}
                                className="flex-none rounded-lg border border-teal/30 px-2.5 py-1 text-[10px] font-semibold text-teal hover:bg-teal/5"
                              >
                                View →
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Override section */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Override (use with caution)</p>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideChecked}
                        onChange={(e) => {
                          setOverrideChecked(e.target.checked);
                          if (e.target.checked && markPaidStage.kind === "blocked") {
                            setMarkPaidStage({ kind: "override", unpaidApps: markPaidStage.unpaidApps, unpaidReleases: markPaidStage.unpaidReleases });
                            setPaymentAmount(markPaid.release.amountReleased.toFixed(2));
                          } else if (!e.target.checked && markPaidStage.kind === "override") {
                            setMarkPaidStage({ kind: "blocked", unpaidApps: markPaidStage.unpaidApps, unpaidReleases: markPaidStage.unpaidReleases });
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
                      />
                      <span className="text-xs text-gray-600 leading-relaxed">
                        I understand other payments are still outstanding and want to record this retention payment as paid anyway. This override will be logged.
                      </span>
                    </label>
                  </div>

                  {/* Override payment form — only shown after checkbox */}
                  {markPaidStage.kind === "override" && (
                    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 px-4 py-4">
                      <p className="text-xs font-semibold text-gray-500">Enter payment details</p>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Amount received</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input type="text" inputMode="decimal" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal" />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Payment date</label>
                        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Reference number <span className="font-normal text-gray-400">(optional)</span></label>
                        <input type="text" placeholder="e.g. Check #1042" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-300 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal" />
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button type="button" onClick={closeMarkPaid} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(true)}
                          disabled={isSavingPayment || !paymentAmount}
                          className="flex-1 rounded-lg border-2 border-navy bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5 disabled:opacity-50"
                        >
                          {isSavingPayment ? "Saving…" : "Record anyway"}
                        </button>
                      </div>
                    </div>
                  )}

                  {markPaidStage.kind === "blocked" && (
                    <button type="button" onClick={closeMarkPaid} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                      Close
                    </button>
                  )}
                </div>
              )}

              {/* ── Normal form (all clear) ── */}
              {markPaidStage.kind === "form" && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <p className="text-xs font-semibold text-green-800">All other payments on this job are current.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Amount received</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Payment date</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Reference number <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Check #1042, Wire Ref ACH-889"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-300 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={closeMarkPaid} className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkPaid(false)}
                      disabled={isSavingPayment || !paymentAmount}
                      className="flex-1 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                    >
                      {isSavingPayment ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
