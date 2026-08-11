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
  fully_released: "Fully Released",
};

export default function RetentionReportPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const { profile } = useCompanyProfile();
  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [summary, setSummary] = useState<RetentionSummary>({ totalHeld: 0, totalReleased: 0, totalRemaining: 0, readyToBillCount: 0 });
  const [asOf] = useState(() => new Date());
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      ],
      rows
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
            { header: "Status" },
          ],
          rows: rows.map((r) => [
            `${r.jobNumber} — ${r.jobName || "—"}`,
            r.customer,
            currency.format(r.contractSum),
            currency.format(r.retentionHeld),
            currency.format(r.totalReleased),
            currency.format(r.remaining),
            STATUS_LABEL[r.status] ?? r.status,
          ]),
          totalsRow: [
            "",
            "Totals",
            "",
            currency.format(summary.totalHeld),
            currency.format(summary.totalReleased),
            currency.format(summary.totalRemaining),
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
          <ReportExportButtons
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            disabled={rows.length === 0 || isExporting}
          />
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
                <th className="px-5 py-3 text-right">% Billed</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => (
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
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">{pct.format(row.percentBilled / 100)}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50 font-semibold text-navy">
                <td className="px-5 py-3" colSpan={3}>Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(summary.totalHeld)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-green-700">{currency.format(summary.totalReleased)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(summary.totalRemaining)}</td>
                <td className="px-5 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
