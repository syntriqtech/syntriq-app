"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import {
  computeBillingSummaryReport,
  defaultYearRange,
  BillingSummaryRow,
  DateRange,
} from "@/lib/reportsData";
import { downloadCsv } from "@/lib/csvExport";
import { exportReportPdf, loadLogoForPdf, LogoData } from "@/lib/reportsPdf";
import ReportExportButtons from "@/components/ReportExportButtons";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function BillingSummaryReportPage() {
  const { jobs, isLoading: isLoadingJobs } = useJobs();
  const { profile } = useCompanyProfile();
  const [range, setRange] = useState<DateRange>(() => defaultYearRange());
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [rows, setRows] = useState<BillingSummaryRow[]>([]);
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
    const scopedJobs = jobFilter === "all" ? jobs : jobs.filter((j) => j.id === jobFilter);
    computeBillingSummaryReport(scopedJobs, range)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load billing summary.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobs, isLoadingJobs, jobFilter, range]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          contractValue: acc.contractValue + row.contractValue,
          billedInRange: acc.billedInRange + row.billedInRange,
          collectedInRange: acc.collectedInRange + row.collectedInRange,
          outstandingBalance: acc.outstandingBalance + row.outstandingBalance,
        }),
        { contractValue: 0, billedInRange: 0, collectedInRange: 0, outstandingBalance: 0 }
      ),
    [rows]
  );

  function handleExportCsv() {
    downloadCsv(
      `billing-summary-${range.start}-to-${range.end}.csv`,
      [
        { header: "Job #", accessor: (r: BillingSummaryRow) => r.jobNumber },
        { header: "Job Name", accessor: (r: BillingSummaryRow) => r.jobName },
        { header: "Customer", accessor: (r: BillingSummaryRow) => r.customer },
        { header: "Contract Value", accessor: (r: BillingSummaryRow) => r.contractValue.toFixed(2) },
        { header: "Billed in Period", accessor: (r: BillingSummaryRow) => r.billedInRange.toFixed(2) },
        { header: "Collected in Period", accessor: (r: BillingSummaryRow) => r.collectedInRange.toFixed(2) },
        { header: "Outstanding Balance", accessor: (r: BillingSummaryRow) => r.outstandingBalance.toFixed(2) },
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
          title: "Billing Summary",
          subtitle: `${range.start} through ${range.end}`,
          companyProfile: profile,
          logo,
          columns: [
            { header: "Job" },
            { header: "Customer" },
            { header: "Contract Value", align: "right" },
            { header: "Billed", align: "right" },
            { header: "Collected", align: "right" },
            { header: "Outstanding", align: "right" },
          ],
          rows: rows.map((r) => [
            `${r.jobNumber} — ${r.jobName || "—"}`,
            r.customer,
            currency.format(r.contractValue),
            currency.format(r.billedInRange),
            currency.format(r.collectedInRange),
            currency.format(r.outstandingBalance),
          ]),
          totalsRow: [
            "",
            "Totals",
            currency.format(totals.contractValue),
            currency.format(totals.billedInRange),
            currency.format(totals.collectedInRange),
            currency.format(totals.outstandingBalance),
          ],
          generatedAt: new Date(),
        },
        `billing-summary-${range.start}-to-${range.end}.pdf`
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
            <h1 className="text-2xl font-bold text-navy">Billing Summary</h1>
            <p className="mt-1 text-sm text-gray-500">
              Contract value, billed, collected, and outstanding balance by job.
            </p>
          </div>
          <ReportExportButtons
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            disabled={rows.length === 0 || isExporting}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Start date</label>
          <input
            type="date"
            value={range.start}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">End date</label>
          <input
            type="date"
            value={range.end}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Job</label>
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          >
            <option value="all">All Jobs</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.jobNumber} — {job.jobName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoadingJobs || isLoadingData ? (
        <p className="text-sm text-gray-500">Loading billing summary…</p>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-400">No billing activity for this selection.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3 text-right">Contract Value</th>
                <th className="px-5 py-3 text-right">Billed in Period</th>
                <th className="px-5 py-3 text-right">Collected in Period</th>
                <th className="px-5 py-3 text-right">Outstanding Balance</th>
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
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{currency.format(row.contractValue)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-navy">{currency.format(row.billedInRange)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-green-700">{currency.format(row.collectedInRange)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-navy">{currency.format(row.outstandingBalance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50 font-semibold text-navy">
                <td className="px-5 py-3" colSpan={2}>Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.contractValue)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.billedInRange)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-green-700">{currency.format(totals.collectedInRange)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{currency.format(totals.outstandingBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
