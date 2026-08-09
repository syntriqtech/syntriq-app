"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { SOVLineItem } from "@/lib/sovData";
import { fetchApplicationOptions, fetchSovItems, SovApplicationOption } from "@/lib/sovLineItemsDb";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";
import { exportInvoiceCoverPdf, loadLogoForPdf, LogoData } from "@/lib/invoiceCoverPdf";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import TextField from "@/components/TextField";
import Button from "@/components/Button";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoiceCoverPage() {
  const { jobs, isLoading } = useJobs();
  const { profile } = useCompanyProfile();
  const [jobNumber, setJobNumber] = useState("");
  const [applicationOptions, setApplicationOptions] = useState<SovApplicationOption[]>([]);
  const [applicationNumber, setApplicationNumber] = useState("1");
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate);
  const [periodTo, setPeriodTo] = useState(todayIsoDate);
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<SOVLineItem[]>([]);

  useEffect(() => {
    if (!jobNumber && jobs.length > 0) setJobNumber(jobs[0].jobNumber);
  }, [jobs, jobNumber]);

  const job = jobs.find((j) => j.jobNumber === jobNumber);

  useEffect(() => {
    if (!job) {
      setApplicationOptions([]);
      setLineItems([]);
      setChangeOrders([]);
      return;
    }
    let cancelled = false;
    fetchApplicationOptions(job.id).then(async (options) => {
      if (cancelled) return;
      setApplicationOptions(options);
      const latest = options[options.length - 1];
      if (latest) {
        setApplicationNumber(latest.applicationNumber);
        setInvoiceDate(latest.applicationDate);
        setPeriodTo(latest.periodTo);
        const { lines, changeOrders: cos } = await fetchSovItems(job.id, latest.applicationNumber);
        if (cancelled) return;
        setLineItems(lines);
        setChangeOrders(cos);
      } else {
        setApplicationNumber("1");
        setLineItems([]);
        setChangeOrders([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [job?.id]);

  async function handleSelectApplication(number: string) {
    if (!job || number === applicationNumber) return;
    setApplicationNumber(number);
    const option = applicationOptions.find((o) => o.applicationNumber === number);
    if (option) {
      setInvoiceDate(option.applicationDate);
      setPeriodTo(option.periodTo);
    }
    const { lines, changeOrders: cos } = await fetchSovItems(job.id, number);
    setLineItems(lines);
    setChangeOrders(cos);
  }

  const cwRate = (job?.retentionRateCW ?? 0) / 100;
  const smRate = (job?.retentionRateSM ?? 0) / 100;

  const allLines = [...lineItems, ...changeOrders];
  const computed = allLines.map((line) => computeLine(line, cwRate, smRate));
  const totals = sumLines(computed);
  const totalEarnedLessRetainage = totals.totalCompleted - totals.retention;
  const prevNetBilled = previousCertificates(allLines, cwRate);
  const currentPaymentDue = totalEarnedLessRetainage - prevNetBilled;

  async function handleDownload() {
    if (!job) return;
    let logo: LogoData | undefined;
    if (profile?.logoUrl) {
      logo = (await loadLogoForPdf(profile.logoUrl)) ?? undefined;
    }
    exportInvoiceCoverPdf({
      job,
      contractLineItems: lineItems,
      changeOrderItems: changeOrders,
      cwRate,
      smRate,
      applicationNumber,
      invoiceDate,
      periodTo,
      gcProjectNumber: job.architectProjectNumber ?? "",
      logo,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Invoice Cover</h1>
        <p className="mt-1 text-sm text-gray-500">The cover sheet that goes out with every billing — job totals, retainage, and current payment due.</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jobSelect" className="text-sm font-medium text-navy">
              Job
            </label>
            <select
              id="jobSelect"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            >
              {isLoading && <option>Loading…</option>}
              {!isLoading && jobs.length === 0 && <option>No jobs yet — add one in Job Setup</option>}
              {jobs.map((j) => (
                <option key={j.id} value={j.jobNumber}>
                  {j.jobName || `⚠ No name (${j.jobNumber})`}{j.jobName ? ` (${j.jobNumber})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="applicationNumber" className="text-sm font-medium text-navy">
              Application #
            </label>
            <select
              id="applicationNumber"
              value={applicationNumber}
              onChange={(e) => handleSelectApplication(e.target.value)}
              disabled={!job}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-50"
            >
              {applicationOptions.length === 0 && <option value={applicationNumber}>#{applicationNumber}</option>}
              {applicationOptions.map((option) => (
                <option key={option.applicationNumber} value={option.applicationNumber}>
                  #{option.applicationNumber}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Invoice date"
            id="invoiceDate"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
          <TextField
            label="Period to"
            id="periodTo"
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </div>
      </div>

      {job && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-500">Bill To</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-medium text-navy text-right">{job.customer}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Billing address</dt>
                <dd className="font-medium text-navy text-right">{job.customerAddress}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-500">Job</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Job #</dt>
                <dd className="font-medium text-navy text-right">{job.jobNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Site address</dt>
                <dd className="font-medium text-navy text-right">{job.jobAddress}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-500">Summary</h2>
        </div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-5 py-3 font-medium text-navy">Total Complete & Stored to Date</td>
              <td className="px-5 py-3 text-right font-medium text-navy">{currency.format(totals.totalCompleted)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-5 py-3 font-medium text-navy">Total Current Retainage Held</td>
              <td className="px-5 py-3 text-right font-medium text-navy">{currency.format(totals.retention)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-5 py-3 font-medium text-navy">Total Earned Less Retainage</td>
              <td className="px-5 py-3 text-right font-medium text-navy">{currency.format(totalEarnedLessRetainage)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-5 py-3 font-medium text-navy">Less Previous Net Billed</td>
              <td className="px-5 py-3 text-right font-medium text-navy">{currency.format(prevNetBilled)}</td>
            </tr>
            <tr className="bg-teal/10">
              <td className="px-5 py-3 text-base font-bold text-navy">Current Payment Due</td>
              <td className="px-5 py-3 text-right text-base font-bold text-navy">{currency.format(currentPaymentDue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <Button type="button" onClick={handleDownload} className="w-auto px-6">
          Download Invoice Cover
        </Button>
      </div>
    </div>
  );
}
