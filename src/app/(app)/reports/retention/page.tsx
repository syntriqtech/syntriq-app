"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { RetentionRow, RetentionSummary } from "@/lib/retentionData";
import { computeRetentionReport } from "@/lib/reportsData";
import { downloadCsv } from "@/lib/csvExport";
import { exportReportPdf, loadLogoForPdf, LogoData } from "@/lib/reportsPdf";
import ReportExportButtons from "@/components/ReportExportButtons";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pct = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

const STATUS_LABEL: Record<string, string> = {
  held: "Held",
  ready_to_bill: "Ready to Bill",
  partial_released: "Partial Release",
  fully_released: "Retention Submitted",
};

// Net discrepancy for a job — the sum of (amountReleased - amountPaid)
// across its paid releases, plus the individual releases that actually
// have one (for the tooltip). Billed-but-unpaid releases are excluded:
// their amountPaid is just 0 by default, which isn't a real discrepancy.
function computeJobDiscrepancy(row: RetentionRow) {
  const discrepantReleases = row.releases.filter(
    (r) => r.status === "paid" && Math.abs(r.discrepancy) > 0.01
  );
  const amount = discrepantReleases.reduce((sum, r) => sum + r.discrepancy, 0);
  return { amount, discrepantReleases };
}

export default function RetentionReportPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const { profile } = useCompanyProfile();
  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [summary, setSummary] = useState<RetentionSummary>({ totalHeld: 0, totalReleased: 0, totalRemaining: 0, readyToBillCount: 0 });
  const [asOf] = useState(() => new Date());
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortDiscrepancyFirst, setSortDiscrepancyFirst] = useState(false);

  useEffect(() => {
    if (isLoadingJobs) return;
    if (jobs.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setIsLoadingData(true);
    setError(null);
    computeRetentionReport(jobs)
      .then(({ rows: data, summary: sum }) => {
        if (cancelled) return;
        setRows(data);
        setSummary(sum);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load retention data.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobs, isLoadingJobs]);

  // When toggled on, surfaces jobs with a non-zero net discrepancy first —
  // that's the actionable list office staff need to scan. Off by default,
  // preserving the existing status-based ordering from computeRetentionReport.
  const displayRows = sortDiscrepancyFirst
    ? [...rows].sort((a, b) => Math.abs(computeJobDiscrepancy(b).amount) - Math.abs(computeJobDiscrepancy(a).amount))
    : rows;

  const asOfLabel = asOf.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function handleExportCsv() {
    downloadCsv(
      `retention-held-vs-released-${asOf.toISOString().slice(0, 10)}.csv`,
      [
        { header: "Job #", accessor: (r: RetentionRow) => r.jobNumber },
        { header: "Job Name", accessor: (r: RetentionRow) => r.jobName },
        { header: "Customer", accessor: (r: RetentionRow) => r.customer },
        { header: "Contract Sum", accessor: (r: RetentionRow) => r.contractSum.toFixed(2) },
        { header: "Retention Held", accessor: (r: RetentionRow) => r.retentionHeld.toFixed(2) },
        { header: "Released", accessor: (r: RetentionRow) => r.totalReleased.toFixed(2) },
        { header: "Remaining", accessor: (r: RetentionRow) => r.remaining.toFixed(2) },
        { header: "% Billed", accessor: (r: RetentionRow) => r.percentBilled.toFixed(1) },
        { header: "Status", accessor: (r: RetentionRow) => STATUS_LABEL[r.status] ?? r.status },
        { header: "Discrepancy", accessor: (r: RetentionRow) => computeJobDiscrepancy(r).amount.toFixed(2) },
        {
          header: "Discrepancy Notes",
          accessor: (r: RetentionRow) =>
            computeJobDiscrepancy(r)
              .discrepantReleases.map((rel) => `RET-${rel.releaseNumber}: ${rel.discrepancyNote || "no reason noted"}`)
              .join("; "),
        },
      ],
      displayRows
    );
  }

  async function handleExportPdf() {
    setIsExporting(true);
    try {
      let logo: LogoData | null = null;
      if (profile?.logoUrl) logo = await loadLogoForPdf(profile.logoUrl);
      exportReportPdf(
        {
          title: "Retention Held vs. Released",
          subtitle: `As of ${asOfLabel}`,
          companyProfile: profile,
          logo,
          columns: [
            { header: "Job" },
            { header: "Customer" },
            { header: "Contract Sum", align: "right" },
            { header: "Retention Held", align: "right" },
            { header: "Released", align: "right" },
            { header: "Remaining", align: "right" },
            { header: "Discrepancy", align: "right" },
            { header: "Status" },
          ],
          rows: displayRows.map((r) => [
            `${r.jobNumber} — ${r.jobName || "—"}`,
            r.customer,
            currency.format(r.contractSum),
            currency.format(r.retentionHeld),
            currency.format(r.totalReleased),
            currency.format(r.remaining),
            currency.format(computeJobDiscrepancy(r).amount),
            STATUS_LABEL[r.status] ?? r.status,
          ]),
          totalsRow: [
            "",
            "Totals",
            "",
            currency.format(summary.totalHeld),
            currency.format(summary.totalReleased),
            currency.format(summary.totalRemaining),
            currency.format(rows.reduce((sum, r) => sum + computeJobDiscrepancy(r).amount, 0)),
            "",
          ],
          generatedAt: asOf,
        },
        `retention-held-vs-released-${asOf.toISOString().slice(0, 10)}.pdf`
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reports" className="text-sm text-gray-400 hover:text-teal">
          ← Reports
        </Link>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-navy">Retention Held vs. Released</h1>
            <p className="mt-1 text-sm text-gray-500">Point-in-time snapshot as of {asOfLabel}.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSortDiscrepancyFirst((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                sortDiscrepancyFirst
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {sortDiscrepancyFirst ? "✓ " : ""}Discrepancies first
            </button>
            <ReportExportButtons
              onExportCsv={handleExportCsv}
              onExportPdf={handleExportPdf}
              disabled={rows.length === 0 || isExporting}
            />
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <div className="text-sm text-gray-500">Total held</div>
          <div className="mt-1 text-2xl font-bold text-navy">{currency.format(summary.totalHeld)}</div>
        </div>
        <div className="p-5">
          <div className="text-sm text-gray-500">Total released</div>
          <div className="mt-1 text-2xl font-bold text-green-700">{currency.format(summary.totalReleased)}</div>
        </div>
        <div className="p-5">
          <div className="text-sm text-gray-500">Remaining</div>
          <div className="mt-1 text-2xl font-bold text-navy">{currency.format(summary.totalRemaining)}</div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoadingJobs || isLoadingData ? (
        <p className="text-sm text-gray-500">Loading retention data…</p>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-400">No retention data yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3 text-right">Contract Sum</th>
                <th className="px-5 py-3 text-right">Retention Held</th>
                <th className="px-5 py-3 text-right">Released</th>
                <th className="px-5 py-3 text-right">Remaining</th>
                <th className="px-5 py-3 text-right">Discrepancy</th>
                <th className="px-5 py-3 text-right">% Billed</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayRows.map((row) => {
                const { amount: discrepancyAmt, discrepantReleases } = computeJobDiscrepancy(row);
                const hasDiscrepancy = discrepantReleases.length > 0;
                return (
                <tr key={row.jobId}>
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-navy">{row.jobName || <span className="text-amber-600">⚠ No name</span>}</div>
                    <div className="text-xs text-gray-400">#{row.jobNumber}</div>
                  </td>
                  <td className="px-5 py-3.5 text-navy">{row.customer}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{currency.format(row.contractSum)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-navy">{currency.format(row.retentionHeld)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-green-700">{row.totalReleased > 0 ? currency.format(row.totalReleased) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{currency.format(row.remaining)}</td>
                  <td className={`px-5 py-3.5 text-right tabular-nums ${hasDiscrepancy ? "text-amber-700 font-semibold" : "text-gray-300"}`}>
                    {hasDiscrepancy ? (
                      <span className="group relative inline-flex cursor-help items-center gap-1">
                        {currency.format(discrepancyAmt)}
                        <span aria-hidden="true">⚠</span>
                        <span className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden w-64 rounded-lg border border-gray-200 bg-white p-2 text-left text-[10px] font-normal leading-snug text-gray-700 shadow-lg group-hover:block">
                          {discrepantReleases.map((rel) => (
                            <p key={rel.id} className="mb-1 last:mb-0">
                              <span className="font-semibold text-navy">RET-{rel.releaseNumber}:</span>{" "}
                              {rel.discrepancy > 0 ? "underpaid" : "overpaid"} by {currency.format(Math.abs(rel.discrepancy))}.
                              {rel.discrepancyNote ? ` ${rel.discrepancyNote}` : " No reason noted."}
                            </p>
                          ))}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">{pct.format(row.percentBilled / 100)}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50 font-semibold text-navy">
                <td className="px-5 py-3" colSpan={3}>Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(summary.totalHeld)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-green-700">{currency.format(summary.totalReleased)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(summary.totalRemaining)}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {currency.format(rows.reduce((sum, r) => sum + computeJobDiscrepancy(r).amount, 0))}
                </td>
                <td className="px-5 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
