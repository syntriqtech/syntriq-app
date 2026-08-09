"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { computeJobMetrics } from "@/lib/dashboardMetrics";
import { fetchPayApplicationsByJob, PayApplication } from "@/lib/payApplicationsDb";
import { fetchPayAppPayments } from "@/lib/payAppPaymentsDb";
import { fetchChangeOrders, ChangeOrder, ChangeOrderStatus } from "@/lib/changeOrdersDb";
import { fetchRetentionReleases, RetentionRelease } from "@/lib/retentionReleasesDb";
import DonutPercent from "@/components/DonutPercent";
import { formatDate } from "@/lib/dateUtils";

// ── Formatters ───────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function extractCity(address: string): string {
  if (!address) return "—";
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[1];
  return address;
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  const s = ["th", "st", "nd", "rd"];
  return `${n}${s[n % 10] ?? "th"}`;
}

function numericSort(a: string, b: string): number {
  const na = parseFloat(a), nb = parseFloat(b);
  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
}

function LabeledBar({
  label,
  percent,
  billed,
  total,
}: {
  label: string;
  percent: number;
  billed: number;
  total: number;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 flex-none text-xs text-gray-500">{label}</span>
      <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : "bg-teal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="flex-none whitespace-nowrap text-right text-xs font-medium tabular-nums text-gray-500">
        {currency.format(billed)} / {currency.format(total)}
      </span>
      <span className="w-9 flex-none text-right text-xs font-medium tabular-nums text-gray-500">{pct}%</span>
    </div>
  );
}

function RetentionGauge({ total, released }: { total: number; released: number }) {
  if (total <= 0) return null;
  const releasedPct = Math.min(100, (released / total) * 100);
  const remainingPct = 100 - releasedPct;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="bg-teal transition-all" style={{ width: `${releasedPct}%` }} />
      <div className="bg-amber-400 transition-all" style={{ width: `${remainingPct}%` }} />
    </div>
  );
}

// ── Pay app status ────────────────────────────────────────────────────────────

type PayAppWithStatus = PayApplication & {
  totalPaid: number;
  paymentStatus: "Unpaid" | "Partial" | "Paid";
};

const PAY_STATUS_STYLE: Record<PayAppWithStatus["paymentStatus"], string> = {
  Paid: "bg-green-100 text-green-700",
  Partial: "bg-amber-100 text-amber-700",
  Unpaid: "bg-gray-100 text-gray-600",
};

// ── CO status ────────────────────────────────────────────────────────────────

const CO_STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  void: "Void",
};

const CO_STATUS_STYLE: Record<ChangeOrderStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  void: "bg-gray-100 text-gray-400",
};

// ── Retention status labels ───────────────────────────────────────────────────

const RET_STATUS_LABEL: Record<RetentionRelease["status"], string> = {
  draft: "Draft",
  billed: "Billed",
  paid: "Paid",
};

const RET_STATUS_STYLE: Record<RetentionRelease["status"], string> = {
  draft: "bg-gray-100 text-gray-500",
  billed: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;
  const router = useRouter();

  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const job = jobs.find((j) => j.id === jobId) ?? null;

  const [percentComplete, setPercentComplete] = useState<number | null>(null);
  const [contractPercent, setContractPercent] = useState<number>(0);
  const [contractValueBase, setContractValueBase] = useState<number>(0);
  const [contractBilled, setContractBilled] = useState<number>(0);
  const [hasChangeOrders, setHasChangeOrders] = useState(false);
  const [changeOrderPercent, setChangeOrderPercent] = useState<number>(0);
  const [changeOrderValue, setChangeOrderValue] = useState<number>(0);
  const [changeOrderBilled, setChangeOrderBilled] = useState<number>(0);
  const [contractValueRevised, setContractValueRevised] = useState<number>(0);
  const [billedToDate, setBilledToDate] = useState<number>(0);
  const [balanceToFinish, setBalanceToFinish] = useState<number>(0);
  const [retentionHeld, setRetentionHeld] = useState<number>(0);
  const [payApps, setPayApps] = useState<PayAppWithStatus[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [releases, setReleases] = useState<RetentionRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoadingJobs || !job) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      computeJobMetrics(job),
      fetchPayApplicationsByJob(job.id),
      fetchChangeOrders(job.id),
      fetchRetentionReleases(job.id),
    ])
      .then(async ([metrics, apps, cos, rels]) => {
        if (cancelled) return;
        setPercentComplete(metrics.percentComplete);
        setContractPercent(metrics.contractPercentComplete);
        setContractValueBase(metrics.contractValueBase);
        setContractBilled(metrics.contractBilledToDate);
        setHasChangeOrders(metrics.hasChangeOrders);
        setChangeOrderPercent(metrics.changeOrderPercentComplete);
        setChangeOrderValue(metrics.changeOrderValue);
        setChangeOrderBilled(metrics.changeOrderBilledToDate);
        setContractValueRevised(metrics.contractValue);
        setBilledToDate(metrics.billedToDate);
        setBalanceToFinish(metrics.balanceToFinish);
        setRetentionHeld(metrics.retention);
        setChangeOrders(
          [...cos].sort((a, b) => numericSort(a.coNumber ?? a.pcoNumber ?? "", b.coNumber ?? b.pcoNumber ?? ""))
        );
        setReleases(rels);

        const appsWithStatus: PayAppWithStatus[] = await Promise.all(
          apps.map(async (app) => {
            const payments = await fetchPayAppPayments(app.id);
            const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
            const paymentStatus: PayAppWithStatus["paymentStatus"] =
              totalPaid <= 0
                ? "Unpaid"
                : totalPaid < app.currentPaymentDue - 0.01
                ? "Partial"
                : "Paid";
            return { ...app, totalPaid, paymentStatus };
          })
        );
        if (!cancelled) setPayApps(appsWithStatus);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load job data.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job, isLoadingJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to SOV to start a new pay application for this job
  function handleCreatePayApp() {
    if (job) {
      sessionStorage.setItem("sov_initial_job", job.jobNumber);
      sessionStorage.setItem("sov_start_next_app", "1");
    }
    router.push("/sov");
  }

  function handleViewSov() {
    if (job) sessionStorage.setItem("sov_initial_job", job.jobNumber);
    router.push("/sov");
  }

  // ── Loading / not found states ────────────────────────────────────────────

  if (isLoadingJobs) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/jobs" className="text-sm text-teal hover:underline">
          ← Back to Jobs
        </Link>
        <p className="text-sm text-gray-500">Job not found.</p>
      </div>
    );
  }

  const city = extractCity(job.jobAddress);
  const totalReleased = releases.reduce((sum, r) => sum + r.amountReleased, 0);
  const retentionRemaining = Math.max(0, retentionHeld - totalReleased);

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Link href="/jobs" className="w-fit text-sm text-teal hover:underline">
        ← Back to Jobs
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            {/* Job name + status */}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-navy">
                {job.jobName || (
                  <span className="text-amber-600">⚠ No job name</span>
                )}
              </h1>
              <span className="inline-flex items-center rounded-full bg-[#E4F4EE] px-3 py-1 text-xs font-semibold text-[#15795A]">
                Active
              </span>
            </div>

            {/* Job # + GC */}
            <p className="mt-1 text-sm text-gray-500">
              {job.jobNumber} · {job.customer}
            </p>

            {/* Detail fields */}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-gray-400">City</dt>
                <dd className="text-sm font-medium text-navy">{city || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Project Manager</dt>
                <dd className="text-sm font-medium text-navy">{job.ctiPm || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">GC Project #</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.architectProjectNumber || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Billing Platform</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.billingPlatform || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Billing Due</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.billingDueDay ? `${ordinal(job.billingDueDay)} of each month` : "—"}
                </dd>
              </div>
            </dl>

            {/* Action buttons */}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleViewSov}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50"
              >
                View SOV
              </button>
              <button
                type="button"
                onClick={handleCreatePayApp}
                className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
              >
                Create pay app
              </button>
            </div>
          </div>

          {/* Progress ring */}
          <div className="flex flex-col items-center gap-1 sm:items-end">
            {percentComplete !== null ? (
              <DonutPercent percent={percentComplete} size={96} />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center text-sm text-gray-400">
                …
              </div>
            )}
            <span className="text-xs text-gray-400">Billed</span>
          </div>
        </div>

        {!isLoading && (
          <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
            <LabeledBar
              label="Contract"
              percent={contractPercent}
              billed={contractBilled}
              total={contractValueBase}
            />
            {hasChangeOrders && (
              <LabeledBar
                label="Change orders"
                percent={changeOrderPercent}
                billed={changeOrderBilled}
                total={changeOrderValue}
              />
            )}
          </div>
        )}
      </div>

      {/* Body: two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: pay apps + change orders */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Pay Applications */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-bold text-navy">Pay Applications</h2>
              <Link
                href="/pay-applications"
                className="text-sm font-semibold text-teal hover:underline"
              >
                All pay apps →
              </Link>
            </div>
            {isLoading ? (
              <p className="px-6 py-4 text-sm text-gray-500">Loading…</p>
            ) : error ? (
              <p className="px-6 py-4 text-sm text-red-600">{error}</p>
            ) : payApps.length === 0 ? (
              <div className="px-6 py-4">
                <p className="text-sm text-gray-500">No pay applications yet.</p>
                <button
                  type="button"
                  onClick={handleCreatePayApp}
                  className="mt-2 text-sm font-semibold text-teal hover:underline"
                >
                  Create first pay app →
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="px-6 py-3 font-medium">App #</th>
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium text-right">Amount</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payApps.map((app) => (
                      <tr key={app.id}>
                        <td className="px-6 py-3 font-semibold text-navy">
                          <Link
                            href={`/pay-applications/${app.id}`}
                            className="hover:underline"
                          >
                            #{app.applicationNumber}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-gray-600">
                          {formatDate(app.applicationDate)}
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-navy">
                          {currencyFull.format(app.currentPaymentDue)}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${PAY_STATUS_STYLE[app.paymentStatus]}`}
                          >
                            {app.paymentStatus}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          {app.pdfUrl && (
                            <a
                              href={app.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-gray-400 hover:text-teal"
                              title="Download saved PDF"
                            >
                              ↓ PDF
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Change Orders */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-bold text-navy">Change Orders</h2>
              <Link
                href={`/change-orders?job=${job.id}`}
                className="text-sm font-semibold text-teal hover:underline"
              >
                All COs →
              </Link>
            </div>
            {isLoading ? (
              <p className="px-6 py-4 text-sm text-gray-500">Loading…</p>
            ) : changeOrders.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-500">No change orders on this job.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="px-6 py-3 font-medium">CO #</th>
                      <th className="px-6 py-3 font-medium">Description</th>
                      <th className="px-6 py-3 font-medium text-right">Amount</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {changeOrders.map((co) => (
                      <tr key={co.id}>
                        <td className="px-6 py-3 font-semibold text-navy">
                          {co.coNumber ?? co.pcoNumber ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-gray-600 max-w-xs truncate">
                          {co.description || "—"}
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-navy">
                          {currency.format(co.amount)}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CO_STATUS_STYLE[co.status]}`}
                          >
                            {CO_STATUS_LABEL[co.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Retention */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-navy">Retention</h2>
              <Link
                href="/retention"
                className="text-sm font-semibold text-teal hover:underline"
              >
                View →
              </Link>
            </div>
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <>
                <dl className="flex flex-col gap-3">
                  <div className="flex justify-between gap-2">
                    <dt className="text-sm text-gray-500">Held</dt>
                    <dd className="text-sm font-bold text-navy">
                      {currency.format(retentionHeld)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sm text-gray-500">Released</dt>
                    <dd className="text-sm font-medium text-navy">
                      {currency.format(totalReleased)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-gray-100 pt-3">
                    <dt className="text-sm font-semibold text-gray-700">Remaining</dt>
                    <dd className="text-sm font-bold text-navy">
                      {currency.format(retentionRemaining)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <RetentionGauge total={retentionHeld} released={totalReleased} />
                </div>

                {releases.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="mb-2 text-xs font-semibold text-gray-400">
                      RELEASES
                    </p>
                    <div className="flex flex-col gap-2">
                      {releases.map((rel) => (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm text-navy">
                              #{rel.releaseNumber} · {currency.format(rel.amountReleased)}
                            </div>
                            <div className="text-xs text-gray-400">
                              {formatDate(rel.releaseDate)}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${RET_STATUS_STYLE[rel.status]}`}
                          >
                            {RET_STATUS_LABEL[rel.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: job info */}
        <div className="flex flex-col gap-6">
          {/* Job Info */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-navy">Job Info</h2>
            <dl className="flex flex-col gap-3">
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Contract value (revised)</dt>
                <dd className="text-sm font-bold text-navy">
                  {currency.format(contractValueRevised)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Billed to date</dt>
                <dd className="text-sm font-medium text-navy">
                  {currency.format(billedToDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-gray-100 pb-3">
                <dt className="text-sm text-gray-500">Balance to finish</dt>
                <dd className="text-sm font-medium text-navy">
                  {currency.format(balanceToFinish)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">GC</dt>
                <dd className="text-sm font-medium text-navy text-right">{job.customer}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500 flex-none">Project address</dt>
                <dd className="text-sm font-medium text-navy text-right max-w-[220px]">
                  {job.jobAddress || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Owner</dt>
                <dd className="text-sm font-medium text-navy text-right max-w-[220px]">
                  {job.owner || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500 flex-none">Architect</dt>
                <dd className="text-sm font-medium text-navy text-right max-w-[220px]">
                  {job.architect || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-gray-100 pt-3">
                <dt className="text-sm text-gray-500">Contract date</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.contractDate ? formatDate(job.contractDate) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Start date</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.startDate ? formatDate(job.startDate) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Billing cycle</dt>
                <dd className="text-sm font-medium text-navy">
                  {ordinal(job.billingDueDay ?? 15)} of month
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Billing platform</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.billingPlatform || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Retention (CW / SM)</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.retentionRateCW}% / {job.retentionRateSM}%
                </dd>
              </div>
              {job.retentionStepdownThreshold != null && (
                <div className="flex justify-between gap-2">
                  <dt className="text-sm text-gray-500">Step-down at</dt>
                  <dd className="text-sm font-medium text-navy">
                    {job.retentionStepdownThreshold}% complete →{" "}
                    {job.retentionStepdownRateCW}%
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Contract for</dt>
                <dd className="text-sm font-medium text-navy text-right max-w-[180px]">
                  {job.contractFor || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-sm text-gray-500">Certified payroll</dt>
                <dd className="text-sm font-medium text-navy">
                  {job.certifiedPayroll ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("jobsetup_edit_job", job.jobNumber);
                  router.push("/job-setup");
                }}
                className="text-sm font-semibold text-teal hover:underline"
              >
                Edit job info →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
