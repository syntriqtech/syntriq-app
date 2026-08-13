"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchPayApplicationById,
  certifyPayApplication,
  uncertifyPayApplication,
  fetchCertificationHistory,
  CertificationEvent,
} from "@/lib/payApplicationsDb";
import { STATUS_LABEL, STATUS_BADGE_STYLE } from "@/lib/payApplicationStatusUi";
import { fetchPayAppPayments, fetchDeletedPayAppPayments, recordPayment, deletePayment, restorePayment, permanentlyDeletePayment, PayAppPayment } from "@/lib/payAppPaymentsDb";
import { fetchJobs, DbJob } from "@/lib/jobs";
import { fetchApplicationOptions, fetchSovItems } from "@/lib/sovLineItemsDb";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";
import { SOVLineItem } from "@/lib/sovData";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import G702Preview from "@/components/G702Preview";
import G703Preview from "@/components/G703Preview";
import { getContractorInfo } from "@/lib/sampleUser";
import type { PayApplication } from "@/lib/payApplicationsDb";
import { formatDate } from "@/lib/dateUtils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PayApplicationDetailPage() {
  const params = useParams();
  const payAppId = params.id as string;

  const [payApp, setPayApp] = useState<PayApplication | null>(null);
  const [job, setJob] = useState<DbJob | null>(null);
  const [payments, setPayments] = useState<PayAppPayment[]>([]);
  const [deletedPayments, setDeletedPayments] = useState<PayAppPayment[]>([]);
  const [showDeletedPayments, setShowDeletedPayments] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "payment">("overview");

  // Payment recording form
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountPaid, setAmountPaid] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [confirmPermDelete, setConfirmPermDelete] = useState<string | null>(null);
  const [isCertifying, setIsCertifying] = useState(false);
  const [certifyError, setCertifyError] = useState<string | null>(null);
  const [showUncertifyConfirm, setShowUncertifyConfirm] = useState(false);
  const [isUncertifying, setIsUncertifying] = useState(false);
  const [uncertifyError, setUncertifyError] = useState<string | null>(null);
  const [certHistory, setCertHistory] = useState<CertificationEvent[]>([]);

  // Billing details (computed from SOV)
  const [billedToDate, setBilledToDate] = useState(0);
  const [retentionHeld, setRetentionHeld] = useState(0);
  // Job-wide retention held to date — same figure the Retention tab shows
  // (latest application's cumulative retention for the job). Equals
  // retentionHeld above whenever this IS the latest application; only
  // differs when viewing an older, superseded application.
  const [jobRetentionHeld, setJobRetentionHeld] = useState(0);
  const [currentPaymentDue, setCurrentPaymentDue] = useState(0);
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<SOVLineItem[]>([]);
  const [contractor, setContractor] = useState({ company: "", companyAddress: "" });

  // Load initial data
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const [payAppData, jobs, contractorData] = await Promise.all([
          fetchPayApplicationById(payAppId),
          fetchJobs(),
          getContractorInfo(),
        ]);

        if (cancelled) return;
        setPayApp(payAppData);
        setContractor(contractorData);

        const foundJob = jobs.find((j) => j.id === payAppData.jobId);
        if (foundJob) {
          setJob(foundJob);

          // Fetch SOV for this application to show billing details
          const { lines, changeOrders: cos } = await fetchSovItems(foundJob.id, payAppData.applicationNumber);
          const cwRate = foundJob.retentionRateCW / 100;
          const smRate = foundJob.retentionRateSM / 100;
          const allLines = [...lines, ...cos];
          const computed = allLines.map((line) => computeLine(line, cwRate, smRate));
          const totals = sumLines(computed);
          setBilledToDate(totals.totalCompleted);
          setRetentionHeld(totals.retention);
          setLineItems(lines);
          setChangeOrders(cos);

          // Job-wide retention held to date, matching how the Retention tab
          // computes it (computeJobBillingRows in billingSummary.ts): the
          // latest application's cumulative retention for this job. Reuse
          // this application's own totals when it IS the latest — no need
          // to refetch its SOV a second time.
          const applicationOptions = await fetchApplicationOptions(foundJob.id);
          const latestAppNumber = applicationOptions[applicationOptions.length - 1]?.applicationNumber;
          if (!latestAppNumber || latestAppNumber === payAppData.applicationNumber) {
            setJobRetentionHeld(totals.retention);
          } else {
            const { lines: latestLines, changeOrders: latestCos } = await fetchSovItems(foundJob.id, latestAppNumber);
            const latestComputed = [...latestLines, ...latestCos].map((line) => computeLine(line, cwRate, smRate));
            setJobRetentionHeld(sumLines(latestComputed).retention);
          }

          // Calculate current payment due
          const earnedLessRetainage = totals.totalCompleted - totals.retention;
          const prevCerts = previousCertificates(allLines, cwRate);
          const currentDue = Math.max(0, earnedLessRetainage - prevCerts);
          setCurrentPaymentDue(currentDue);
        }

        // Fetch payments for this pay app
        const [paymentsData, deletedPaymentsData] = await Promise.all([
          fetchPayAppPayments(payAppId),
          fetchDeletedPayAppPayments(payAppId),
        ]);
        if (!cancelled) {
          setPayments(paymentsData);
          setDeletedPayments(deletedPaymentsData);
        }

        // Certify/uncertify audit trail — best-effort, doesn't block the page
        fetchCertificationHistory(payAppId)
          .then((history) => {
            if (!cancelled) setCertHistory(history);
          })
          .catch(() => {});
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load pay application.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payAppId]);

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payApp || !job) return;
    setRecordError(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setRecordError("Enter a valid payment date.");
      return;
    }
    if (paymentDate > todayIso) {
      setRecordError("Payment date can't be in the future.");
      return;
    }
    if (paymentDate < minPaymentDate) {
      setRecordError(
        job.startDate
          ? `Payment date can't be before the job start date (${formatDate(job.startDate)}).`
          : `Payment date can't be before ${formatDate(minPaymentDate)}.`
      );
      return;
    }

    const enteredAmount = Number(amountPaid) || 0;
    if (enteredAmount > balance + 0.01) {
      setRecordError(
        `This would overpay the application. The remaining balance is ${currency.format(Math.max(0, balance))}.`
      );
      return;
    }

    setIsRecording(true);

    try {
      await recordPayment(
        payAppId,
        paymentDate,
        enteredAmount,
        referenceNumber,
        notes
      );
      // Refresh payments list
      const updated = await fetchPayAppPayments(payAppId);
      setPayments(updated);
      // Clear form
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setAmountPaid("");
      setReferenceNumber("");
      setNotes("");
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Could not record payment.");
    } finally {
      setIsRecording(false);
    }
  }

  async function handleMarkCertified() {
    if (!payApp) return;
    setCertifyError(null);
    if (currentPaymentDue <= 0) {
      setCertifyError("This pay application totals $0.00 — add billing amounts before certifying.");
      return;
    }
    setIsCertifying(true);
    try {
      const updated = await certifyPayApplication(payApp.id);
      setPayApp(updated);
      fetchCertificationHistory(payAppId).then(setCertHistory).catch(() => {});
    } catch (err) {
      setCertifyError(err instanceof Error ? err.message : "Could not mark this application certified.");
    } finally {
      setIsCertifying(false);
    }
  }

  // Reverts a certified application back to Submitted — for accidental
  // certifications. Blocked server-side (and pre-checked here) unless
  // status is exactly "certified" with zero payments recorded, since any
  // recorded payment would otherwise be left referencing a no-longer-
  // certified application. Doesn't touch amount/line-item data at all —
  // only status and certified_date change.
  async function handleUncertify() {
    if (!payApp) return;
    setUncertifyError(null);
    setIsUncertifying(true);
    try {
      const updated = await uncertifyPayApplication(payApp.id);
      setPayApp(updated);
      setShowUncertifyConfirm(false);
      fetchCertificationHistory(payAppId).then(setCertHistory).catch(() => {});
    } catch (err) {
      setUncertifyError(err instanceof Error ? err.message : "Could not uncertify this application.");
    } finally {
      setIsUncertifying(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    try {
      await deletePayment(paymentId);
      // Refresh both lists
      const [updated, deleted] = await Promise.all([
        fetchPayAppPayments(payAppId),
        fetchDeletedPayAppPayments(payAppId),
      ]);
      setPayments(updated);
      setDeletedPayments(deleted);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Could not delete payment.");
    }
  }

  async function handleRestorePayment(paymentId: string) {
    setRecordError(null);
    const target = deletedPayments.find((p) => p.id === paymentId);
    if (target && totalPaid + target.amountPaid > amountDue + 0.01) {
      setRecordError(
        `Restoring this payment would overpay the application. Amount due is ${currency.format(amountDue)}; already paid is ${currency.format(totalPaid)}.`
      );
      return;
    }
    try {
      await restorePayment(paymentId);
      const [updated, deleted] = await Promise.all([
        fetchPayAppPayments(payAppId),
        fetchDeletedPayAppPayments(payAppId),
      ]);
      setPayments(updated);
      setDeletedPayments(deleted);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Could not restore payment.");
    }
  }

  async function handlePermanentDelete(paymentId: string) {
    try {
      await permanentlyDeletePayment(paymentId);
      setConfirmPermDelete(null);
      const deleted = await fetchDeletedPayAppPayments(payAppId);
      setDeletedPayments(deleted);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Could not permanently delete payment.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Pay Application</h1>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !payApp || !job) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Pay Application</h1>
        <p className="text-sm text-red-600">{error || "Pay application not found."}</p>
      </div>
    );
  }

  // Compute payment totals
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const amountDue = currentPaymentDue;
  const balance = amountDue - totalPaid;

  // Bound the payment date field: never in the future, and never before the
  // job's start date. Jobs don't always have a start date on record, so when
  // it's missing we fall back to a 5-year window instead of leaving the
  // minimum unbounded.
  const todayIso = new Date().toISOString().slice(0, 10);
  const fallbackMinDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().slice(0, 10);
  })();
  const minPaymentDate = job.startDate || fallbackMinDate;

  return (
    <div className="flex flex-col gap-6">
      {/* Header with tabs */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">Pay Application #{payApp.applicationNumber}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {job.jobNumber}{job.jobName ? ` · ${job.jobName}` : ""} — {job.customer}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Billing platform: {job.billingPlatform || "Not set"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLE[payApp.status]}`}>
              {STATUS_LABEL[payApp.status]}
            </span>
            {(payApp.status === "certified" || payApp.status === "paid") && (
              <p className="text-xs text-gray-500">
                {currency.format(totalPaid)} of {currency.format(amountDue)} paid
              </p>
            )}
            {payApp.status === "certified" && (
              totalPaid > 0 ? (
                <p className="max-w-[200px] text-right text-[11px] text-gray-400">
                  Can&apos;t uncertify — {currency.format(totalPaid)} already recorded in payments. Delete those first.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUncertifyConfirm(true)}
                  className="text-xs font-medium text-gray-400 hover:text-red-500"
                >
                  Uncertify
                </button>
              )
            )}
          </div>
        </div>
        {certifyError && <p className="mt-2 text-sm text-red-600">{certifyError}</p>}
        {uncertifyError && !showUncertifyConfirm && <p className="mt-2 text-sm text-red-600">{uncertifyError}</p>}

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "border-b-2 border-teal text-teal"
                : "text-gray-500 hover:text-navy"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("payment")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "payment"
                ? "border-b-2 border-teal text-teal"
                : "text-gray-500 hover:text-navy"
            }`}
          >
            Record Payments
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Application details */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="text-base font-bold text-navy">Application Details</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-400">Application date</dt>
                <dd className="mt-1 font-medium text-navy">{formatDate(payApp.applicationDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Period to</dt>
                <dd className="mt-1 font-medium text-navy">{formatDate(payApp.periodTo)}</dd>
              </div>
            </dl>
            {certHistory.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400">Certification history</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {certHistory.map((ev) => (
                    <li key={ev.id} className="text-xs text-gray-500">
                      {ev.action === "certified" ? "Certified" : "Uncertified"} — {formatDate(ev.occurredAt.slice(0, 10))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Billing summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-white p-4">
              <p className="text-xs text-gray-400">Billed to date</p>
              <p className="mt-2 text-lg font-bold text-navy">{currency.format(billedToDate)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4">
              <p className="text-xs text-gray-400">Retention held</p>
              <p className="mt-2 text-lg font-bold text-navy">{currency.format(retentionHeld)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4">
              <p className="text-xs text-gray-400">Net due</p>
              <p className="mt-2 text-lg font-bold text-navy">{currency.format(amountDue)}</p>
            </div>
          </div>

          {/* Payment status summary */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="text-base font-bold text-navy">Payment Status</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Amount due</dt>
                <dd className="font-medium text-navy">{currency.format(amountDue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Amount paid to date</dt>
                <dd className="font-medium text-navy">{currency.format(totalPaid)}</dd>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between font-bold">
                <dt className="text-navy">Balance due</dt>
                <dd className={balance > 0 ? "text-orange-600" : "text-green-600"}>
                  {currency.format(Math.max(0, balance))}
                </dd>
              </div>
            </dl>
          </div>

          {/* Billing Package Preview */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-base font-bold text-navy mb-6">Billing Package Preview</h2>
            <div className="flex flex-col gap-6">
              {payApp && job && (
                <>
                  <G702Preview
                    job={job}
                    applicationNumber={payApp.applicationNumber}
                    applicationDate={payApp.applicationDate}
                    periodTo={payApp.periodTo}
                    lineItems={lineItems}
                    changeOrders={changeOrders}
                    cwRate={(job.retentionRateCW ?? 0) / 100}
                    smRate={(job.retentionRateSM ?? 0) / 100}
                    totalCompleted={billedToDate}
                    totalRetention={retentionHeld}
                    currentPaymentDue={amountDue}
                    contractorName={contractor.company}
                    contractorAddress={contractor.companyAddress}
                  />

                  <G703Preview
                    lineItems={lineItems}
                    changeOrders={changeOrders}
                    cwRate={(job.retentionRateCW ?? 0) / 100}
                    smRate={(job.retentionRateSM ?? 0) / 100}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Recording Tab */}
      {activeTab === "payment" && (
        <div className="flex flex-col gap-6">
          {/* Record payment form */}
          <form onSubmit={handleRecordPayment} className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="text-base font-bold text-navy">Record Payment</h2>

            {/* Payment summary strip */}
            <div className="mt-4 grid grid-cols-4 divide-x divide-gray-100 rounded-xl border border-gray-100 bg-gray-50">
              <div className="px-4 py-3">
                <p className="text-[11px] text-gray-400">Amount due</p>
                <p className="mt-0.5 text-sm font-bold text-navy">{currency.format(amountDue)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-gray-400">Paid so far</p>
                <p className="mt-0.5 text-sm font-bold text-navy">{currency.format(totalPaid)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-gray-400">Balance due</p>
                <p className={`mt-0.5 text-sm font-bold ${balance > 0.01 ? "text-orange-600" : "text-green-600"}`}>
                  {balance > 0.01 ? currency.format(balance) : "Paid in full"}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-gray-400">Retention held</p>
                <p className="mt-0.5 text-sm font-bold text-navy">{currency.format(retentionHeld)}</p>
                <p className="mt-0.5 text-[10px] text-gray-400">{currency.format(jobRetentionHeld)} job to date</p>
              </div>
            </div>

            {payApp.status !== "certified" && payApp.status !== "paid" ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-800">This application isn&apos;t certified yet.</p>
                <p className="mt-1 text-xs text-amber-700">
                  Mark certified to enable payments.
                </p>
                <button
                  type="button"
                  onClick={handleMarkCertified}
                  disabled={isCertifying}
                  className="mt-3 rounded-lg bg-[#1D8F96] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1D8F96]/90 disabled:opacity-50"
                >
                  {isCertifying ? "Marking certified…" : "Mark certified"}
                </button>
              </div>
            ) : balance <= 0.01 ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-4">
                <p className="text-sm font-semibold text-green-800">This pay application is paid in full.</p>
                <p className="mt-1 text-xs text-green-700">
                  {currency.format(totalPaid)} received — no further payment can be recorded.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    label="Payment date"
                    id="paymentDate"
                    type="date"
                    required
                    min={minPaymentDate}
                    max={todayIso}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                  <div className="flex flex-col gap-1.5">
                    <TextField
                      label="Amount paid"
                      id="amountPaid"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                    {/* Hint: expected balance */}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Expected: <span className="font-semibold text-navy">{currency.format(balance)}</span></span>
                      <button
                        type="button"
                        onClick={() => setAmountPaid(balance.toFixed(2))}
                        className="rounded px-1.5 py-0.5 text-teal border border-teal/30 hover:bg-teal/5 font-medium"
                      >
                        Use this
                      </button>
                    </div>
                    {/* Mismatch warning */}
                    {amountPaid !== "" &&
                      Number(amountPaid) > 0 &&
                      Math.abs(Number(amountPaid) - balance) > 0.01 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                        Heads up — this doesn&apos;t match the balance due ({currency.format(balance)}). Are you sure this is correct?
                      </div>
                    )}
                  </div>
                  <TextField
                    label="Check / wire / ACH number (optional)"
                    id="referenceNumber"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                  <div />
                  <div className="sm:col-span-2">
                    <label htmlFor="notes" className="block text-sm font-medium text-navy">
                      Notes (optional)
                    </label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                      rows={3}
                    />
                  </div>
                </div>
                {recordError && <p className="mt-3 text-sm text-red-600">{recordError}</p>}
                <div className="mt-4">
                  <Button type="submit" disabled={isRecording} className="w-auto px-6">
                    {isRecording ? "Recording…" : "Record Payment"}
                  </Button>
                </div>
              </>
            )}
          </form>

          {/* Payment history */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="text-base font-bold text-navy">Payment History</h2>
            {payments.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No payments recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="px-3 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium text-right">Amount</th>
                      <th className="px-3 py-3 font-medium">Reference</th>
                      <th className="px-3 py-3 font-medium">Notes</th>
                      <th className="px-3 py-3 font-medium text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-3 py-3 text-navy">{formatDate(payment.paymentDate)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-navy">
                          {currency.format(payment.amountPaid)}
                        </td>
                        <td className="px-3 py-3 text-gray-600">{payment.referenceNumber || "—"}</td>
                        <td className="px-3 py-3 text-gray-600">{payment.notes || "—"}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(payment.id)}
                            className="text-sm font-medium text-red-600 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50 font-bold text-navy">
                      <td className="px-3 py-3">Total paid</td>
                      <td className="px-3 py-3 text-right">{currency.format(totalPaid)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Recently Deleted section */}
          {deletedPayments.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6">
              <button
                type="button"
                onClick={() => setShowDeletedPayments(!showDeletedPayments)}
                className="flex w-full items-center justify-between"
              >
                <h2 className="text-base font-bold text-navy">Recently Deleted</h2>
                <span className="text-sm text-gray-500">{showDeletedPayments ? "▼" : "▶"}</span>
              </button>

              {showDeletedPayments && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500">
                        <th className="px-3 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium text-right">Amount</th>
                        <th className="px-3 py-3 font-medium">Reference</th>
                        <th className="px-3 py-3 font-medium">Notes</th>
                        <th className="px-3 py-3 font-medium text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {deletedPayments.map((payment) => (
                        <tr key={payment.id} className="opacity-70">
                          <td className="px-3 py-3 text-gray-600">{formatDate(payment.paymentDate)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-gray-600">
                            {currency.format(payment.amountPaid)}
                          </td>
                          <td className="px-3 py-3 text-gray-600">{payment.referenceNumber || "—"}</td>
                          <td className="px-3 py-3 text-gray-600">{payment.notes || "—"}</td>
                          <td className="px-3 py-3 text-right">
                            {confirmPermDelete === payment.id ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-xs text-gray-500">Delete forever?</span>
                                <button
                                  type="button"
                                  onClick={() => handlePermanentDelete(payment.id)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                                >
                                  Yes, delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmPermDelete(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleRestorePayment(payment.id)}
                                  className="text-sm font-medium text-teal hover:text-teal/80"
                                >
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmPermDelete(payment.id)}
                                  className="text-sm font-medium text-red-500 hover:text-red-700"
                                >
                                  Delete permanently
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Uncertify confirmation */}
      {showUncertifyConfirm && payApp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={isUncertifying ? undefined : () => setShowUncertifyConfirm(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">Uncertify this application?</h2>
              {!isUncertifying && (
                <button
                  type="button"
                  onClick={() => setShowUncertifyConfirm(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4 p-6">
              <p className="text-sm text-gray-600">
                This reverts the application back to Submitted so it can be edited again. The billing data itself —
                line items, amounts, change orders — is not touched.
              </p>

              {payApp.pdfUrl && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                  This was already sent to the GC. Uncertifying it here won&apos;t recall that copy — you may need to
                  notify them separately.
                </p>
              )}

              {uncertifyError && <p className="text-sm text-red-600">{uncertifyError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUncertifyConfirm(false)}
                  disabled={isUncertifying}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUncertify}
                  disabled={isUncertifying}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isUncertifying ? "Uncertifying…" : "Yes, uncertify"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
