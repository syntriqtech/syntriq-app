"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { JobBillingRow } from "@/lib/billingSummary";
import { computeArAgingReport } from "@/lib/reportsData";
import { downloadCsv } from "@/lib/csvExport";
import { exportReportPdf, loadLogoForPdf, LogoData } from "@/lib/reportsPdf";
import { formatDate } from "@/lib/dateUtils";
import ReportExportButtons from "@/components/ReportExportButtons";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ArAgingReportPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const { profile } = useCompanyProfile();
  const [rows, setRows] = useState<JobBillingRow[]>([]);
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
    computeArAgingReport(jobs)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load AR aging data.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobs, isLoadingJobs]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          current: acc.current + row.amountCurrent,
          d31to60: acc.d31to60 + row.amount31to60,
          d61to90: acc.d61to90 + row.amount61to90,
          d90plus: acc.d90plus + row.amount90plus,
          openAR: acc.openAR + row.openAR,
        }),
        { current: 0, d31to60: 0, d61to90: 0, d90plus: 0, openAR: 0 }
      ),
    [rows]
  );

  const asOfLabel = asOf.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function handleExportCsv() {
    downloadCsv(
      `ar-aging-snapshot-${asOf.toISOString().slice(0, 10)}.csv`,
      [
        { header: "Job #", accessor: (r: JobBillingRow) => r.jobNumber },
        { header: "Job Name", accessor: (r: JobBillingRow) => r.jobName },
        { header: "Customer", accessor: (r: JobBillingRow) => r.customer },
        { header: "Current", accessor: (r: JobBillingRow) => r.amountCurrent.toFixed(2) },
        { header: "31-60 Days", accessor: (r: JobBillingRow) => r.amount31to60.toFixed(2) },
        { header: "61-90 Days", accessor: (r: JobBillingRow) => r.amount61to90.toFixed(2) },
        { header: "90+ Days", accessor: (r: JobBillingRow) => r.amount90plus.toFixed(2) },
        { header: "Total Open AR", accessor: (r: JobBillingRow) => r.openAR.toFixed(2) },
        { header: "Last Payment", accessor: (r: JobBillingRow) => (r.lastPaymentDate ? formatDate(r.lastPaymentDate) : "") },
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
          title: "AR Aging Snapshot",
          subtitle: `As of ${asOfLabel}`,
          companyProfile: profile,
          logo,
          columns: [
            { header: "Job" },
            { header: "Customer" },
            { header: "Current", align: "right" },
            { header: "31-60", align: "right" },
            { header: "61-90", align: "right" },
            { header: "90+", align: "right" },
            { header: "Total Open AR", align: "right" },
          ],
          rows: rows.map((r) => [
            `${r.jobNumber} — ${r.jobName || "—"}`,
            r.customer,
            currency.format(r.amountCurrent),
            currency.format(r.amount31to60),
            currency.format(r.amount61to90),
            currency.format(r.amount90plus),
            currency.format(r.openAR),
          ]),
          totalsRow: [
            "",
            "Totals",
            currency.format(totals.current),
            currency.format(totals.d31to60),
            currency.format(totals.d61to90),
            currency.format(totals.d90plus),
            currency.format(totals.openAR),
          ],
          generatedAt: asOf,
        },
        `ar-aging-snapshot-${asOf.toISOString().slice(0, 10)}.pdf`
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
            <h1 className="text-2xl font-bold text-navy">AR Aging Snapshot</h1>
            <p className="mt-1 text-sm text-gray-500">Point-in-time snapshot as of {asOfLabel}.</p>
          </div>
          <ReportExportButtons
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            disabled={rows.length === 0 || isExporting}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoadingJobs || isLoadingData ? (
        <p className="text-sm text-gray-500">Loading AR aging data…</p>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-400">No open AR right now.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3 text-right">Current</th>
                <th className="px-5 py-3 text-right">31-60 Days</th>
                <th className="px-5 py-3 text-right">61-90 Days</th>
                <th className="px-5 py-3 text-right">90+ Days</th>
                <th className="px-5 py-3 text-right">Total Open AR</th>
                <th className="px-5 py-3">Last Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => (
                <tr key={row.jobId} className={row.amount90plus > 0 ? "bg-red-50/30" : undefined}>
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-navy">{row.jobName || <span className="text-amber-600">⚠ No name</span>}</div>
                    <div className="text-xs text-gray-400">#{row.jobNumber}</div>
                  </td>
                  <td className="px-5 py-3.5 text-navy">{row.customer}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{row.amountCurrent > 0 ? currency.format(row.amountCurrent) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{row.amount31to60 > 0 ? currency.format(row.amount31to60) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{row.amount61to90 > 0 ? currency.format(row.amount61to90) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-red-700">{row.amount90plus > 0 ? currency.format(row.amount90plus) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-navy">{currency.format(row.openAR)}</td>
                  <td className="px-5 py-3.5 text-gray-500">{row.lastPaymentDate ? formatDate(row.lastPaymentDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50 font-semibold text-navy">
                <td className="px-5 py-3" colSpan={2}>Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.current)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.d31to60)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.d61to90)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-red-700">{currency.format(totals.d90plus)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.openAR)}</td>
                <td className="px-5 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
