"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { SOVLineItem } from "@/lib/sovData";
import { fetchApplicationOptions, fetchSovItems, SovApplicationOption } from "@/lib/sovLineItemsDb";
import { sampleUser, getContractorInfo } from "@/lib/sampleUser";
import { fetchUserProfile, saveUserSignature, formatSignerLine } from "@/lib/userProfileDb";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";
import { exportLienWaiverPdf, LienWaiverKind } from "@/lib/lienWaiverPdf";
import { findPayApplication } from "@/lib/payApplicationsDb";
import { recordLienWaiverGenerated, fetchLienWaiversForApplication, LienWaiver } from "@/lib/lienWaiversDb";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import AdoptSignatureModal from "@/components/AdoptSignatureModal";
import { formatDate } from "@/lib/dateUtils";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const WAIVER_CARDS: { kind: LienWaiverKind; title: string; description: string }[] = [
  {
    kind: "conditional-progress",
    title: "Conditional Waiver and Release on Progress Payment",
    description: "Use when sending an invoice — takes effect once the check clears.",
  },
  {
    kind: "unconditional-progress",
    title: "Unconditional Waiver and Release on Progress Payment",
    description: "Use once a progress payment has actually been received.",
  },
  {
    kind: "conditional-final",
    title: "Conditional Waiver and Release on Final Payment",
    description: "Use when sending the final invoice — takes effect once the final check clears.",
  },
  {
    kind: "unconditional-final",
    title: "Unconditional Waiver and Release on Final Payment",
    description: "Use once the final payment has actually been received in full.",
  },
];

export default function LienWaiversPage() {
  const { jobs, isLoading } = useJobs();
  const [jobNumber, setJobNumber] = useState("");
  const [applicationOptions, setApplicationOptions] = useState<SovApplicationOption[]>([]);
  const [applicationNumber, setApplicationNumber] = useState("1");
  const [throughDate, setThroughDate] = useState(todayIsoDate);
  const [signatureDate, setSignatureDate] = useState(todayIsoDate);
  const [claimantTitle, setClaimantTitle] = useState("");
  const [amountOfCheck, setAmountOfCheck] = useState("");
  const [unpaidProgressDates, setUnpaidProgressDates] = useState("");
  const [unpaidProgressAmounts, setUnpaidProgressAmounts] = useState("");
  const [disputedExtrasAmount, setDisputedExtrasAmount] = useState("0");
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<SOVLineItem[]>([]);
  const [contractor, setContractor] = useState({ company: sampleUser.company });
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string>("");
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [waiverHistory, setWaiverHistory] = useState<LienWaiver[]>([]);
  const [downloadingKind, setDownloadingKind] = useState<LienWaiverKind | null>(null);

  useEffect(() => {
    getContractorInfo().then(setContractor);
    fetchUserProfile().then((p) => {
      if (!p) return;
      const signer = formatSignerLine(p);
      if (signer) setClaimantTitle(signer);
      if (p.fullName) setUserFullName(p.fullName);
      if (p.signatureData) {
        setSavedSignature(p.signatureData);
        setSignatureDataUrl(p.signatureData);
      }
    }).catch(() => {});
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
    fetchApplicationOptions(job.id).then(async (options) => {
      if (cancelled) return;
      setApplicationOptions(options);
      const latest = options[options.length - 1];
      if (latest) {
        setApplicationNumber(latest.applicationNumber);
        setThroughDate(latest.periodTo);
        setSignatureDate(latest.applicationDate);
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

  useEffect(() => {
    if (!job || !applicationNumber) {
      setWaiverHistory([]);
      return;
    }
    let cancelled = false;
    fetchLienWaiversForApplication(job.id, applicationNumber)
      .then((rows) => { if (!cancelled) setWaiverHistory(rows); })
      .catch(() => { if (!cancelled) setWaiverHistory([]); });
    return () => {
      cancelled = true;
    };
  }, [job?.id, applicationNumber]);

  async function handleSelectApplication(number: string) {
    if (!job || number === applicationNumber) return;
    setApplicationNumber(number);
    const option = applicationOptions.find((o) => o.applicationNumber === number);
    if (option) {
      setThroughDate(option.periodTo);
      setSignatureDate(option.applicationDate);
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
  const prevCertificates = previousCertificates(allLines, cwRate);
  const suggestedAmountDue = totalEarnedLessRetainage - prevCertificates;

  async function handleDownload(kind: LienWaiverKind) {
    if (!job) return;
    const amount = Number(amountOfCheck) || suggestedAmountDue;
    exportLienWaiverPdf(
      {
        job,
        claimantName: contractor.company,
        amountOfCheck: amount,
        throughDate,
        signatureDate,
        claimantTitle,
        unpaidProgressDates,
        unpaidProgressAmounts,
        disputedExtrasAmount: Number(disputedExtrasAmount) || 0,
        signatureDataUrl: signatureDataUrl ?? undefined,
      },
      kind
    );

    setDownloadingKind(kind);
    try {
      const payApp = await findPayApplication(job.id, applicationNumber).catch(() => null);
      await recordLienWaiverGenerated({
        jobId: job.id,
        applicationNumber,
        kind,
        amountOfCheck: amount,
        throughDate,
        signatureDate,
        payApplicationId: payApp?.id ?? null,
        revisionNumber: payApp?.revisionNumber ?? 1,
      });
      const rows = await fetchLienWaiversForApplication(job.id, applicationNumber);
      setWaiverHistory(rows);
    } catch {
      // don't block the download the user already has if the history write fails
    } finally {
      setDownloadingKind(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Lien Waivers</h1>
        <p className="mt-1 text-sm text-gray-500">
          The four California statutory waiver and release forms (Civil Code §8132–8138), pre-filled from this job.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            label="Through date (progress waivers)"
            id="throughDate"
            type="date"
            value={throughDate}
            onChange={(e) => setThroughDate(e.target.value)}
          />
          <TextField
            label="Date of signature"
            id="signatureDate"
            type="date"
            value={signatureDate}
            onChange={(e) => setSignatureDate(e.target.value)}
          />
          <TextField
            label="Amount of check"
            id="amountOfCheck"
            type="number"
            min="0"
            step="0.01"
            placeholder={suggestedAmountDue.toFixed(2)}
            value={amountOfCheck}
            onChange={(e) => setAmountOfCheck(e.target.value)}
          />
          <TextField
            label="Claimant's title (signer name & title)"
            id="claimantTitle"
            placeholder="e.g. Jason Blancaflor, Owner"
            value={claimantTitle}
            onChange={(e) => setClaimantTitle(e.target.value)}
          />
          <TextField
            label="Disputed extras amount (final waivers)"
            id="disputedExtrasAmount"
            type="number"
            min="0"
            step="0.01"
            value={disputedExtrasAmount}
            onChange={(e) => setDisputedExtrasAmount(e.target.value)}
          />
          <TextField
            label="Unpaid progress payment date(s)"
            id="unpaidProgressDates"
            placeholder="Optional — only if claiming an exception"
            value={unpaidProgressDates}
            onChange={(e) => setUnpaidProgressDates(e.target.value)}
          />
          <TextField
            label="Unpaid progress payment amount(s)"
            id="unpaidProgressAmounts"
            placeholder="Optional — only if claiming an exception"
            value={unpaidProgressAmounts}
            onChange={(e) => setUnpaidProgressAmounts(e.target.value)}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Leave &quot;Amount of check&quot; blank to use this job&apos;s suggested current payment due ({suggestedAmountDue.toLocaleString("en-US", { style: "currency", currency: "USD" })}).
        </p>
      </div>

      {/* ── Signature ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500">Signature</h2>
        <p className="mt-1 text-sm text-gray-500">Stamped on the claimant&apos;s signature line of each waiver you download.</p>
        <div className="mt-4">
          {signatureDataUrl ? (
            <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureDataUrl} alt="Adopted signature" className="h-12 object-contain" />
              <button type="button" onClick={() => setSigModalOpen(true)} className="text-xs font-medium text-teal hover:underline">Change signature</button>
              <button type="button" onClick={() => setSignatureDataUrl(null)} className="text-xs font-medium text-gray-400 hover:text-red-500">Remove</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSigModalOpen(true)}
              className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal/40 bg-teal/5 text-sm font-medium text-teal hover:border-teal hover:bg-teal/10 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              Click to adopt your signature
            </button>
          )}
        </div>
      </div>

      <AdoptSignatureModal
        open={sigModalOpen}
        initialName={userFullName}
        savedSignature={savedSignature || undefined}
        onAdopt={(dataUrl, remember) => {
          setSignatureDataUrl(dataUrl);
          setSigModalOpen(false);
          if (remember) {
            setSavedSignature(dataUrl);
            saveUserSignature(dataUrl).catch(() => {});
          }
        }}
        onClose={() => setSigModalOpen(false)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {WAIVER_CARDS.map((card) => (
          <div key={card.kind} className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-navy">{card.title}</h2>
              <p className="mt-1 text-sm text-gray-500">{card.description}</p>
            </div>
            <Button
              type="button"
              onClick={() => handleDownload(card.kind)}
              disabled={downloadingKind === card.kind}
              className="w-auto px-6"
            >
              {downloadingKind === card.kind ? "Downloading…" : "Download"}
            </Button>
          </div>
        ))}
      </div>

      {waiverHistory.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500">
            Previously generated for Application #{applicationNumber}
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {waiverHistory.map((waiver) => (
              <div key={waiver.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-navy">
                    {WAIVER_CARDS.find((c) => c.kind === waiver.kind)?.title ?? waiver.kind}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDate(waiver.generatedAt.slice(0, 10))} — {waiver.amountOfCheck.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </span>
                </div>
                {waiver.stale && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                    Waiver on file was generated at {waiver.amountOfCheck.toLocaleString("en-US", { style: "currency", currency: "USD" })} — this application has since been revised.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
