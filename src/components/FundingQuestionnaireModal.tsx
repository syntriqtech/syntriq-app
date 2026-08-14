"use client";

import { useState } from "react";
import Link from "next/link";
import { DbJob, archiveJob } from "@/lib/jobs";
import { verifyJobPayments, VerificationResult, UnpaidApp, UnpaidRelease } from "@/lib/jobPaymentVerification";
import { formatDate } from "@/lib/dateUtils";
import { RetentionRelease } from "@/lib/retentionReleasesDb";
import { regenerateRetentionBillingPackage } from "@/lib/retentionBillingPackagePdf";

type Step = "question" | "verifying" | "outstanding" | "confirm" | "done";

type Props = {
  job: DbJob;
  release: RetentionRelease;
  onClose: () => void;
  onArchived: () => void;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export default function FundingQuestionnaireModal({ job, release, onClose, onArchived }: Props) {
  const [step, setStep] = useState<Step>("question");
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isDownloadingWaiver, setIsDownloadingWaiver] = useState(false);
  const [waiverError, setWaiverError] = useState<string | null>(null);

  // Only a *final* retention release produces an "unconditional final"
  // waiver — a partial release's paid waiver is "unconditional progress"
  // instead, which isn't what this action is for.
  async function handleDownloadWaiver() {
    setWaiverError(null);
    setIsDownloadingWaiver(true);
    try {
      await regenerateRetentionBillingPackage(release, job);
    } catch (err) {
      setWaiverError(err instanceof Error ? err.message : "Could not generate waiver.");
    } finally {
      setIsDownloadingWaiver(false);
    }
  }

  // ── Verification ───────────────────────────────────────────────────────────

  async function runVerification() {
    setVerifyError(null);
    setStep("verifying");

    try {
      const result = await verifyJobPayments(job.id);
      setVerifyResult(result);
      setStep(result.ok ? "confirm" : "outstanding");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Could not verify payment records.");
      setStep("question");
    }
  }

  // ── Archive ────────────────────────────────────────────────────────────────

  async function handleArchive() {
    setArchiveError(null);
    setIsArchiving(true);
    try {
      await archiveJob(job.id);
      setStep("done");
      onArchived();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Could not archive job.");
    } finally {
      setIsArchiving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={step === "verifying" ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-navy">Retention payment received</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {job.jobName || job.jobNumber} · {job.customer}
            </p>
          </div>
          {step !== "verifying" && (
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 text-xl leading-none text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>

        {/* Signed unconditional final waiver — available as soon as this release
            is marked paid, independent of whether the user goes on to archive. */}
        {release.isFinal && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-6 py-3">
            <p className="text-xs text-gray-500">Final retention payment recorded.</p>
            <button
              type="button"
              onClick={handleDownloadWaiver}
              disabled={isDownloadingWaiver}
              className="flex-none rounded-lg border border-teal/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal hover:bg-teal/5 disabled:opacity-50"
            >
              {isDownloadingWaiver ? "Preparing…" : "Download signed unconditional final"}
            </button>
          </div>
        )}
        {waiverError && (
          <p className="border-b border-gray-100 bg-red-50 px-6 py-2 text-xs text-red-700">{waiverError}</p>
        )}

        <div className="px-6 py-5">

          {/* ── Step: question ─────────────────────────────── */}
          {step === "question" && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-base font-semibold text-navy">Was this project 100% funded?</p>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                  A fully funded project means the original contract value, all approved change
                  orders, and all retention across every SOV line have been paid in full — nothing
                  outstanding from the GC.
                </p>
              </div>

              {verifyError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {verifyError}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={runVerification}
                  className="w-full rounded-xl border-2 border-teal bg-teal/5 px-4 py-3 text-left transition-colors hover:bg-teal/10"
                >
                  <p className="text-sm font-semibold text-teal">Yes — fully funded</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Syntriq will verify all payments are recorded before offering to archive.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                >
                  <p className="text-sm font-semibold text-gray-600">No — still waiting on payments</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Dismiss for now. This prompt will reappear on the next retention payment.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ── Step: verifying ────────────────────────────── */}
          {step === "verifying" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-teal" />
              <div className="text-center">
                <p className="text-sm font-semibold text-navy">Checking payment records…</p>
                <p className="mt-1 text-xs text-gray-500">
                  Verifying every pay application and retention release for this job.
                </p>
              </div>
            </div>
          )}

          {/* ── Step: outstanding ──────────────────────────── */}
          {step === "outstanding" &&
            verifyResult &&
            !verifyResult.ok && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Not all payments are recorded yet
                  </p>
                  <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                    Syntriq checked the actual records and found the following items still
                    outstanding. Go record those payments first, then come back.
                  </p>
                </div>

                <div className="flex flex-col gap-3 max-h-60 overflow-y-auto">
                  {/* Unpaid pay applications */}
                  {verifyResult.unpaidApps.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Pay applications — not fully paid
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {verifyResult.unpaidApps.map(({ app, outstanding }) => (
                          <div
                            key={app.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-navy">
                                Pay App #{app.applicationNumber}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatDate(app.applicationDate)} ·{" "}
                                <span className="font-medium text-red-600">
                                  {currency.format(outstanding)} outstanding
                                </span>
                              </p>
                            </div>
                            <Link
                              href={`/pay-applications/${app.id}`}
                              onClick={onClose}
                              className="flex-none rounded-lg border border-teal/30 px-2.5 py-1 text-[10px] font-semibold text-teal hover:bg-teal/5"
                            >
                              Record →
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unpaid retention releases */}
                  {verifyResult.unpaidReleases.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Retention releases — not fully paid
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {verifyResult.unpaidReleases.map(({ release, outstanding }) => (
                          <div
                            key={release.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-navy">
                                Retention Release #{release.releaseNumber}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatDate(release.releaseDate)} ·{" "}
                                <span className="font-medium text-red-600">
                                  {currency.format(outstanding)} outstanding
                                </span>
                              </p>
                            </div>
                            <Link
                              href="/retention"
                              onClick={onClose}
                              className="flex-none rounded-lg border border-teal/30 px-2.5 py-1 text-[10px] font-semibold text-teal hover:bg-teal/5"
                            >
                              Record →
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={runVerification}
                    className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
                  >
                    Re-check
                  </button>
                </div>
              </div>
            )}

          {/* ── Step: confirm ──────────────────────────────── */}
          {step === "confirm" && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-sm font-semibold text-green-800">
                  All payments verified
                </p>
                <p className="mt-0.5 text-xs text-green-700">
                  Every pay application and retention release on this job is marked paid.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-900 mb-2">Archiving this job will:</p>
                <ul className="flex flex-col gap-1 text-xs text-amber-800 list-disc pl-4">
                  <li>Move it out of the active job list and dashboard.</li>
                  <li>Lock it from further SOV, billing, and change order edits.</li>
                  <li>
                    Preserve all pay applications, billing history, retention records, and waivers —
                    fully intact and viewable in the Archive tab.
                  </li>
                  <li>This action is reversible — you can unarchive from the Archive tab if needed.</li>
                </ul>
              </div>

              {archiveError && <p className="text-sm text-red-600">{archiveError}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("question")}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isArchiving}
                  className="flex-1 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50"
                >
                  {isArchiving ? "Archiving…" : "Archive this job"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: done ─────────────────────────────────── */}
          {step === "done" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-center">
                <p className="text-base font-bold text-green-800">Job archived</p>
                <p className="mt-1 text-sm text-green-700">
                  {job.jobName || job.jobNumber} has been moved to the Archive tab. All history is
                  preserved and read-only.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
