"use client";

import { useEffect, useState } from "react";
import { DbJob, fetchArchivedJobs, unarchiveJob } from "@/lib/jobs";
import { fetchPayApplicationsByJob, PayApplication } from "@/lib/payApplicationsDb";
import { fetchRetentionReleases, RetentionRelease } from "@/lib/retentionReleasesDb";
import { formatDate } from "@/lib/dateUtils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

type JobHistory = {
  payApps: PayApplication[];
  releases: RetentionRelease[];
};

type ExpandState = Record<string, JobHistory | "loading">;

function parseLineDetail(notes: string): { item: string; description: string; releaseAmount: number }[] {
  try {
    const parsed = JSON.parse(notes.split("---")[1]?.trim() ?? notes);
    if (parsed?.wizard === "v1" && Array.isArray(parsed.lines)) {
      return parsed.lines.map((l: { item: string; description: string; releaseAmount: number }) => ({
        item: l.item,
        description: l.description,
        releaseAmount: Number(l.releaseAmount),
      }));
    }
  } catch {
    // notes is not JSON — plain text
  }
  return [];
}

export default function ArchivePage() {
  const [jobs, setJobs] = useState<DbJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandState>({});
  const [unarchiving, setUnarchiving] = useState<string | null>(null);
  const [confirmUnarchive, setConfirmUnarchive] = useState<string | null>(null);

  useEffect(() => {
    fetchArchivedJobs()
      .then(setJobs)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load archived jobs."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleToggle(job: DbJob) {
    if (expanded[job.id]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      return;
    }
    setExpanded((prev) => ({ ...prev, [job.id]: "loading" }));
    try {
      const [payApps, releases] = await Promise.all([
        fetchPayApplicationsByJob(job.id),
        fetchRetentionReleases(job.id),
      ]);
      setExpanded((prev) => ({ ...prev, [job.id]: { payApps, releases } }));
    } catch {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    }
  }

  async function handleUnarchive(jobId: string) {
    setUnarchiving(jobId);
    try {
      await unarchiveJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setConfirmUnarchive(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not unarchive.");
    } finally {
      setUnarchiving(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Archive</h1>
        <p className="text-sm text-gray-500">Loading archived jobs…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Archive</h1>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Archive</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fully funded, closed-out jobs. Read-only — all history preserved.
        </p>
      </div>

      {/* Notice banner */}
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <span className="mt-0.5 text-gray-400">🔒</span>
        <p>
          Archived jobs are locked from editing. To restore a job to active status, use the Unarchive button — this is a safety measure for correcting mistakes only.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="py-20 text-center rounded-2xl border border-gray-100 bg-white shadow-sm">
          <p className="text-sm font-semibold text-gray-400">No archived jobs yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Jobs appear here after you mark them as fully funded from the Retention tab.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((job) => {
            const hist = expanded[job.id];
            const isExpanded = !!hist;
            const isHistLoading = hist === "loading";
            const histData = hist && hist !== "loading" ? hist : null;

            return (
              <div key={job.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                {/* Job row */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggle(job)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span className="font-semibold text-navy">
                        {job.jobName || <span className="text-amber-600">⚠ No name</span>}
                      </span>
                      <span className="text-xs text-gray-400">#{job.jobNumber}</span>
                      <span className="text-xs text-gray-300">{isExpanded ? "▴" : "▾"}</span>
                    </button>
                    <p className="mt-0.5 text-xs text-gray-500">{job.customer}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Contract value</div>
                      <div className="font-semibold text-navy">{currency.format(job.contractValue)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Archived</div>
                      <div className="font-semibold text-gray-600">{formatDate(job.archivedAt ?? "")}</div>
                    </div>
                    <div>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                        Archived
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {confirmUnarchive === job.id ? (
                      <>
                        <span className="text-xs text-gray-500">Restore to active?</span>
                        <button
                          type="button"
                          onClick={() => handleUnarchive(job.id)}
                          disabled={unarchiving === job.id}
                          className="text-xs font-semibold text-teal hover:underline disabled:opacity-50"
                        >
                          {unarchiving === job.id ? "Restoring…" : "Yes, unarchive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmUnarchive(null)}
                          className="text-xs font-semibold text-gray-400 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmUnarchive(job.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                      >
                        Unarchive
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded history */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                    {isHistLoading ? (
                      <p className="text-sm text-gray-400">Loading history…</p>
                    ) : (
                      <div className="flex flex-col gap-6">
                        {/* Pay Applications */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Pay Applications
                          </p>
                          {histData!.payApps.length === 0 ? (
                            <p className="text-xs text-gray-400">No pay applications on record.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-100">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    <th className="px-4 py-2.5">App #</th>
                                    <th className="px-4 py-2.5">Date</th>
                                    <th className="px-4 py-2.5">Period To</th>
                                    <th className="px-4 py-2.5 text-right">Amount Billed</th>
                                    <th className="px-4 py-2.5 text-right">Payment Due</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {histData!.payApps.map((app) => (
                                    <tr key={app.id} className="bg-white">
                                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                                        #{app.applicationNumber}
                                      </td>
                                      <td className="px-4 py-2.5 text-gray-600">{formatDate(app.applicationDate)}</td>
                                      <td className="px-4 py-2.5 text-gray-600">{formatDate(app.periodTo)}</td>
                                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-navy">
                                        {currency.format(app.amountBilled)}
                                      </td>
                                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                                        {currency.format(app.currentPaymentDue)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Retention Releases */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Retention Releases
                          </p>
                          {histData!.releases.length === 0 ? (
                            <p className="text-xs text-gray-400">No retention releases on record.</p>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {histData!.releases.map((rel) => {
                                const lineDetail = parseLineDetail(rel.notes);
                                return (
                                  <div key={rel.id} className="rounded-xl border border-gray-100 bg-gray-50/50">
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold text-navy">
                                          Release #{rel.releaseNumber}
                                        </span>
                                        <span className="text-xs text-gray-500">{formatDate(rel.releaseDate)}</span>
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                            rel.isFinal
                                              ? "bg-blue-100 text-blue-700"
                                              : "bg-gray-100 text-gray-500"
                                          }`}
                                        >
                                          {rel.isFinal ? "Final" : "Partial"}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                            rel.status === "paid"
                                              ? "bg-green-100 text-green-700"
                                              : "bg-amber-100 text-amber-700"
                                          }`}
                                        >
                                          {rel.status === "paid" ? "Paid" : "Billed"}
                                        </span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-sm font-bold text-navy">
                                          {currency.format(rel.amountReleased)}
                                        </span>
                                        {rel.amountPaid > 0 && (
                                          <span className="ml-2 text-xs text-green-700">
                                            ({currency.format(rel.amountPaid)} paid)
                                          </span>
                                        )}
                                        {rel.paymentReference && (
                                          <div className="mt-0.5 text-[10px] text-gray-400">
                                            Ref: {rel.paymentReference}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {lineDetail.length > 0 && (
                                      <div className="border-t border-gray-100 px-4 pb-3 pt-2">
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                          Per-line breakdown
                                        </p>
                                        <div className="flex flex-col gap-0.5">
                                          {lineDetail.map((l, i) => (
                                            <div
                                              key={i}
                                              className="flex items-center justify-between text-xs text-gray-600"
                                            >
                                              <span>
                                                <span className="font-mono text-gray-400 mr-2">{l.item}</span>
                                                {l.description}
                                              </span>
                                              <span className="tabular-nums font-semibold text-navy">
                                                {currency.format(l.releaseAmount)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
