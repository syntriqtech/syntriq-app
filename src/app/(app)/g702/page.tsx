"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/hooks/useJobs";
import { SOVLineItem } from "@/lib/sovData";
import { fetchApplicationOptions, fetchSovItems, SovApplicationOption } from "@/lib/sovLineItemsDb";
import { exportPayApplicationPdf } from "@/lib/payAppPdf";
import { sampleUser, getContractorInfo } from "@/lib/sampleUser";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function G702Page() {
  const { jobs, isLoading } = useJobs();
  const [jobNumber, setJobNumber] = useState("");
  const [applicationOptions, setApplicationOptions] = useState<SovApplicationOption[]>([]);
  const [applicationNumber, setApplicationNumber] = useState("1");
  const [applicationDate, setApplicationDate] = useState(todayIsoDate);
  const [periodTo, setPeriodTo] = useState(todayIsoDate);
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<SOVLineItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [contractor, setContractor] = useState({ company: sampleUser.company, companyAddress: sampleUser.companyAddress });

  useEffect(() => {
    getContractorInfo().then(setContractor);
  }, []);

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
    setIsLoadingItems(true);
    fetchApplicationOptions(job.id)
      .then(async (options) => {
        if (cancelled) return;
        setApplicationOptions(options);
        const latest = options[options.length - 1];
        if (latest) {
          setApplicationNumber(latest.applicationNumber);
          setApplicationDate(latest.applicationDate);
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
      })
      .finally(() => {
        if (!cancelled) setIsLoadingItems(false);
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
      setApplicationDate(option.applicationDate);
      setPeriodTo(option.periodTo);
    }
    setIsLoadingItems(true);
    try {
      const { lines, changeOrders: cos } = await fetchSovItems(job.id, number);
      setLineItems(lines);
      setChangeOrders(cos);
    } finally {
      setIsLoadingItems(false);
    }
  }

  const cwRate = (job?.retentionRateCW ?? 0) / 100;
  const smRate = (job?.retentionRateSM ?? 0) / 100;

  const allLines = [...lineItems, ...changeOrders];
  const computed = allLines.map((line) => computeLine(line, cwRate, smRate));
  const totals = sumLines(computed);

  const netChangeOrders = changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
  const contractSumToDate = (job?.contractValue ?? 0) + netChangeOrders;
  const retentionCW = cwRate * allLines.reduce((sum, line) => sum + line.previousApplications + line.thisPeriod, 0);
  const retentionSM = smRate * allLines.reduce((sum, line) => sum + line.storedMaterials, 0);
  const totalEarnedLessRetainage = totals.totalCompleted - totals.retention;
  const prevCertificates = previousCertificates(allLines, cwRate);
  const currentPaymentDue = totalEarnedLessRetainage - prevCertificates;
  const balanceToFinishIncRetainage = contractSumToDate - totals.totalCompleted;

  const additions = changeOrders.filter((co) => co.scheduledValue >= 0).reduce((sum, co) => sum + co.scheduledValue, 0);
  const deductions = changeOrders.filter((co) => co.scheduledValue < 0).reduce((sum, co) => sum + -co.scheduledValue, 0);

  const changeOrderRows: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Total Additions", value: currency.format(additions) },
    { label: "Total Deductions", value: currency.format(deductions) },
    { label: "Net Change by Change Orders", value: currency.format(netChangeOrders), highlight: true },
  ];

  const summaryRows: { label: string; value: string; highlight?: boolean; emphasize?: boolean }[] = [
    { label: "Original Contract Sum", value: currency.format(job?.contractValue ?? 0) },
    { label: "Net Change by Change Orders", value: currency.format(netChangeOrders) },
    { label: "Contract Sum to Date", value: currency.format(contractSumToDate), highlight: true },
    { label: "Total Completed & Stored to Date", value: currency.format(totals.totalCompleted) },
    { label: "Retainage — Completed Work", value: currency.format(retentionCW) },
    { label: "Retainage — Stored Materials", value: currency.format(retentionSM) },
    { label: "Total Retainage", value: currency.format(totals.retention), highlight: true },
    { label: "Total Earned Less Retainage", value: currency.format(totalEarnedLessRetainage) },
    { label: "Less Previous Certificates for Payment", value: currency.format(prevCertificates) },
    { label: "CURRENT PAYMENT DUE", value: currency.format(currentPaymentDue), highlight: true, emphasize: true },
    { label: "Balance to Finish, Including Retainage", value: currency.format(balanceToFinishIncRetainage) },
  ];

  function handleDownloadG702() {
    if (!job) return;
    exportPayApplicationPdf(
      {
        job,
        contractorName: contractor.company,
        contractorAddress: contractor.companyAddress,
        applicationNumber,
        applicationDate,
        periodTo,
        lineItems,
        changeOrders,
        cwRate,
        smRate,
      },
      "g702"
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">G702 Cover Sheet</h1>
          <p className="mt-1 text-sm text-gray-500">Application & Certificate for Payment — summary of this period's billing.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
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
            <label htmlFor="appNumber" className="text-sm font-medium text-navy">
              Application #
            </label>
            <select
              id="appNumber"
              value={applicationNumber}
              onChange={(e) => handleSelectApplication(e.target.value)}
              disabled={!job || isLoadingItems}
              className="w-32 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:opacity-50"
            >
              {applicationOptions.length === 0 && <option value={applicationNumber}>#{applicationNumber}</option>}
              {applicationOptions.map((option) => (
                <option key={option.applicationNumber} value={option.applicationNumber}>
                  #{option.applicationNumber}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="appDate" className="text-sm font-medium text-navy">
              Application date
            </label>
            <input
              id="appDate"
              type="date"
              value={applicationDate}
              onChange={(e) => setApplicationDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="periodTo" className="text-sm font-medium text-navy">
              Period to
            </label>
            <input
              id="periodTo"
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <Link
            href="/pay-applications"
            className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10"
          >
            Record Payment
          </Link>
          <button
            type="button"
            onClick={handleDownloadG702}
            disabled={!job || isLoadingItems}
            className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
          >
            Download G702
          </button>
        </div>
      </div>

      {job && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-500">To Owner</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium text-navy text-right">{job.owner}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Address</dt>
                  <dd className="font-medium text-navy text-right">{job.ownerAddress}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-500">From Contractor</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium text-navy text-right">{contractor.company}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Address</dt>
                  <dd className="font-medium text-navy text-right">{contractor.companyAddress}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-500">Via Architect</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium text-navy text-right">{job.architect}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Address</dt>
                  <dd className="font-medium text-navy text-right">{job.architectAddress}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-500">Project</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Job</dt>
                  <dd className="font-medium text-navy text-right">
                    {job.jobNumber}{job.jobName ? ` · ${job.jobName}` : ""} — {job.customer}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Contract for</dt>
                  <dd className="font-medium text-navy text-right">{job.contractFor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Contract date</dt>
                  <dd className="font-medium text-navy text-right">{job.contractDate}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GC project #</dt>
                  <dd className="font-medium text-navy text-right">{job.architectProjectNumber}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-500">Application</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Application #</dt>
                  <dd className="font-medium text-navy text-right">{applicationNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Application date</dt>
                  <dd className="font-medium text-navy text-right">{applicationDate}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Period to</dt>
                  <dd className="font-medium text-navy text-right">{periodTo}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {summaryRows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b border-gray-100 last:border-0 ${row.highlight ? "bg-teal/10" : ""}`}
                >
                  <td
                    className={`px-5 py-3 ${row.emphasize ? "font-bold text-navy" : "font-medium text-navy"}`}
                  >
                    {row.label}
                  </td>
                  <td
                    className={`px-5 py-3 text-right ${row.emphasize ? "text-base font-bold text-navy" : "font-medium text-navy"}`}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-500">Change Order Summary</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {changeOrderRows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b border-gray-100 last:border-0 ${row.highlight ? "bg-teal/10" : ""}`}
                >
                  <td className="px-5 py-3 font-medium text-navy">{row.label}</td>
                  <td className="px-5 py-3 text-right font-medium text-navy">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
