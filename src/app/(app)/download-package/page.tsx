"use client";

import { useEffect, useRef, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { SOVLineItem } from "@/lib/sovData";
import { fetchApplicationOptions, fetchSovItems, SovApplicationOption } from "@/lib/sovLineItemsDb";
import { sampleUser, getContractorInfo } from "@/lib/sampleUser";
import { fetchUserProfile, saveUserSignature, formatSignerLine } from "@/lib/userProfileDb";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";
import Link from "next/link";
import { exportBillingPackage } from "@/lib/billingPackagePdf";
import { loadLogoForPdf, LogoData } from "@/lib/invoiceCoverPdf";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { findPayApplication, savePayApplicationPdf } from "@/lib/payApplicationsDb";
import { LienWaiverKind } from "@/lib/lienWaiverPdf";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import AdoptSignatureModal from "@/components/AdoptSignatureModal";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const WAIVER_OPTIONS: { kind: LienWaiverKind; label: string }[] = [
  { kind: "conditional-progress", label: "Conditional Waiver — Progress Payment" },
  { kind: "unconditional-progress", label: "Unconditional Waiver — Progress Payment" },
  { kind: "conditional-final", label: "Conditional Waiver — Final Payment" },
  { kind: "unconditional-final", label: "Unconditional Waiver — Final Payment" },
];

type SaveState = "ask" | "overwrite" | "saving" | "saved" | "error";

export default function DownloadPackagePage() {
  const { jobs, isLoading } = useJobs();
  const { profile } = useCompanyProfile();
  const sortedJobs = [...jobs].sort((a, b) => {
    const na = parseFloat(a.jobNumber), nb = parseFloat(b.jobNumber);
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.jobNumber.localeCompare(b.jobNumber);
  });
  const [jobNumber, setJobNumber] = useState("");
  const [applicationOptions, setApplicationOptions] = useState<SovApplicationOption[]>([]);
  const [applicationNumber, setApplicationNumber] = useState("1");
  const [applicationDate, setApplicationDate] = useState(todayIsoDate);
  const [periodTo, setPeriodTo] = useState(todayIsoDate);
  const [selectedWaivers, setSelectedWaivers] = useState<LienWaiverKind[]>(["conditional-progress"]);
  const [claimantTitle, setClaimantTitle] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string>("");
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<SOVLineItem[]>([]);
  const [contractor, setContractor] = useState({ company: sampleUser.company, companyAddress: sampleUser.companyAddress });

  // Carries a specific job/application handed off from another page (e.g. SOV "save" prompt)
  const initialJobRef = useRef<string | null>(null);
  const initialAppRef = useRef<string | null>(null);

  // Save-prompt state
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("ask");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [existingPdfUrl, setExistingPdfUrl] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // The pay_applications row (if any) matching the selected job + application
  // number — lets "Record Payment" deep-link straight to it instead of the
  // generic list. Null until a pay application actually exists for this
  // combination (e.g. before it's ever been saved/billed).
  const [currentPayAppId, setCurrentPayAppId] = useState<string | null>(null);

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

  // Consume a hand-off job/application from sessionStorage (set right before navigating here)
  useEffect(() => {
    const initJob = sessionStorage.getItem("dlpkg_initial_job");
    const initApp = sessionStorage.getItem("dlpkg_initial_app");
    if (initJob) {
      sessionStorage.removeItem("dlpkg_initial_job");
      sessionStorage.removeItem("dlpkg_initial_app");
      initialJobRef.current = initJob;
      initialAppRef.current = initApp;
    }
  }, []);

  useEffect(() => {
    if (!jobNumber && sortedJobs.length > 0) {
      setJobNumber(initialJobRef.current ?? sortedJobs[0].jobNumber);
    }
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
      const targetAppNumber = initialAppRef.current;
      initialAppRef.current = null; // consume once — later job switches fall back to "latest"
      const chosen = (targetAppNumber && options.find((o) => o.applicationNumber === targetAppNumber)) || options[options.length - 1];
      if (chosen) {
        setApplicationNumber(chosen.applicationNumber);
        setApplicationDate(chosen.applicationDate);
        setPeriodTo(chosen.periodTo);
        const { lines, changeOrders: cos } = await fetchSovItems(job.id, chosen.applicationNumber);
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
    if (!job) {
      setCurrentPayAppId(null);
      return;
    }
    let cancelled = false;
    findPayApplication(job.id, applicationNumber)
      .then((found) => {
        if (!cancelled) setCurrentPayAppId(found?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentPayAppId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, applicationNumber]);

  async function handleSelectApplication(number: string) {
    if (!job || number === applicationNumber) return;
    setApplicationNumber(number);
    const option = applicationOptions.find((o) => o.applicationNumber === number);
    if (option) {
      setApplicationDate(option.applicationDate);
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
  const prevCertificates = previousCertificates(allLines, cwRate);
  const suggestedAmountDue = totalEarnedLessRetainage - prevCertificates;

  function toggleWaiver(kind: LienWaiverKind) {
    setSelectedWaivers((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  }

  async function handleDownload() {
    if (!job) return;
    setIsGenerating(true);
    try {
      let logo: LogoData | undefined;
      if (profile?.logoUrl) {
        logo = (await loadLogoForPdf(profile.logoUrl)) ?? undefined;
      }

      const blob = await exportBillingPackage({
        payApp: {
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
          signatureDataUrl: signatureDataUrl ?? undefined,
        },
        invoiceCover: {
          job,
          contractLineItems: lineItems,
          changeOrderItems: changeOrders,
          cwRate,
          smRate,
          applicationNumber,
          invoiceDate: applicationDate,
          periodTo,
          gcProjectNumber: job.architectProjectNumber ?? "",
          logo,
        },
        lienWaivers: selectedWaivers.map((kind) => ({
          kind,
          data: {
            job,
            claimantName: contractor.company,
            amountOfCheck: suggestedAmountDue,
            throughDate: periodTo,
            signatureDate: applicationDate,
            claimantTitle,
            unpaidProgressDates: "",
            unpaidProgressAmounts: "",
            disputedExtrasAmount: 0,
            signatureDataUrl: signatureDataUrl ?? undefined,
          },
        })),
      });

      // Check if a pay app record already has a saved PDF
      const existingApp = await findPayApplication(job.id, applicationNumber);

      setPendingBlob(blob);
      setExistingPdfUrl(existingApp?.pdfUrl ?? null);
      setSaveState("ask");
      setSaveErrorMsg(null);
      setSavePromptOpen(true);
    } finally {
      setIsGenerating(false);
    }
  }

  function closeSavePrompt() {
    setSavePromptOpen(false);
    setPendingBlob(null);
    setExistingPdfUrl(null);
    setSaveErrorMsg(null);
    setSaveState("ask");
  }

  function handleSaveYes() {
    if (existingPdfUrl) {
      setSaveState("overwrite");
    } else {
      doSave();
    }
  }

  async function doSave() {
    if (!job || !pendingBlob) return;
    setSaveState("saving");
    try {
      await savePayApplicationPdf(
        job.id,
        applicationNumber,
        applicationDate,
        periodTo,
        totals.totalCompleted,
        suggestedAmountDue,
        pendingBlob
      );
      const saved = await findPayApplication(job.id, applicationNumber);
      setCurrentPayAppId(saved?.id ?? null);
      setSaveState("saved");
      setTimeout(closeSavePrompt, 3000);
    } catch (err) {
      setSaveErrorMsg(err instanceof Error ? err.message : "Save failed.");
      setSaveState("error");
    }
  }

  // Escape closes the save prompt, matching JobCreatedModal — but not mid-save,
  // since doSave() is already in flight and closing would just hide progress.
  useEffect(() => {
    if (!savePromptOpen || saveState === "saving") return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSavePrompt();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [savePromptOpen, saveState]);

  const canDownload = Boolean(job) && Boolean(signatureDataUrl) && claimantTitle.trim().length > 0;

  // Deep-link straight to this job's pay application when one exists (same
  // route pattern used from the dashboard, jobs page, and pay-applications
  // list: `/pay-applications/${app.id}`). If no pay application row exists
  // yet for this job + application number, fall back to the same
  // job-context hand-off the dashboard's Open AR widget already uses:
  // stash the job number in sessionStorage and land on the list, which
  // auto-expands and scrolls to that job.
  const recordPaymentHref = currentPayAppId ? `/pay-applications/${currentPayAppId}` : "/pay-applications";
  function handleRecordPaymentNav() {
    if (!currentPayAppId && job) {
      sessionStorage.setItem("pay_initial_job", job.jobNumber);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Download Package</h1>
        <p className="mt-1 text-sm text-gray-500">
          Build the full billing package for one application — pay application, invoice cover, and lien waivers — sign once, download one file.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500">1. Job & application</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              {!isLoading && sortedJobs.length === 0 && <option>No jobs yet — add one in Job Setup</option>}
              {sortedJobs.map((j) => (
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
            label="Application date"
            id="applicationDate"
            type="date"
            value={applicationDate}
            onChange={(e) => setApplicationDate(e.target.value)}
          />
          <TextField
            label="Period to"
            id="periodTo"
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Suggested current payment due for this application: {suggestedAmountDue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500">2. Documents to include</h2>
        <p className="mt-1 text-sm text-gray-500">The pay application packet (G702 + SOV) and invoice cover are always included. Choose which lien waiver(s) to add.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WAIVER_OPTIONS.map((option) => (
            <label key={option.kind} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-navy">
              <input
                type="checkbox"
                checked={selectedWaivers.includes(option.kind)}
                onChange={() => toggleWaiver(option.kind)}
                className="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal/30"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500">3. Sign</h2>
        <p className="mt-1 text-sm text-gray-500">
          This signature is stamped on the G702 contractor line and every lien waiver in the package.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <TextField
            label="Signer name & title"
            id="claimantTitle"
            placeholder="e.g. Jason Blancaflor, Owner"
            value={claimantTitle}
            onChange={(e) => setClaimantTitle(e.target.value)}
          />
          {signatureDataUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-navy">Signature</p>
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureDataUrl} alt="Adopted signature" className="h-12 object-contain" />
                <button
                  type="button"
                  onClick={() => setSigModalOpen(true)}
                  className="text-xs font-medium text-teal hover:underline"
                >
                  Change signature
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureDataUrl(null)}
                  className="text-xs font-medium text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-navy">Signature</p>
              <button
                type="button"
                onClick={() => setSigModalOpen(true)}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal/40 bg-teal/5 text-sm font-medium text-teal hover:border-teal hover:bg-teal/10 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Click to adopt your signature
              </button>
            </div>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleDownload} disabled={!canDownload || isGenerating} className="w-auto px-6">
          {isGenerating ? "Building package…" : "Download Package"}
        </Button>
        <Link
          href={recordPaymentHref}
          onClick={handleRecordPaymentNav}
          className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10"
        >
          Record Payment
        </Link>
      </div>
      {!canDownload && (
        <p className="text-xs text-gray-500">Add a signer name/title and sign above to enable download.</p>
      )}

      {/* ── Save prompt — centered modal, matching JobCreatedModal / DownloadPackagePromptModal ── */}
      {savePromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={saveState === "saving" ? undefined : closeSavePrompt}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-navy">Download Package</h2>
              {saveState !== "saving" && (
                <button
                  type="button"
                  onClick={closeSavePrompt}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex flex-col gap-5 p-6">
              {saveState === "ask" && (
                <>
                  <div>
                    <p className="text-sm font-semibold text-navy">Save this record payment?</p>
                    <p className="mt-1 text-sm text-gray-600">
                      The signed PDF will be saved and available for re-download anytime from Record Payment.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeSavePrompt}
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50"
                    >
                      No, skip
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveYes}
                      className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
                    >
                      Yes, save
                    </button>
                  </div>
                </>
              )}

              {saveState === "overwrite" && (
                <>
                  <div>
                    <p className="text-sm font-semibold text-navy">Replace saved PDF?</p>
                    <p className="mt-1 text-sm text-gray-600">
                      A saved PDF already exists for Application #{applicationNumber}. Saving now will replace it.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeSavePrompt}
                      className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={doSave}
                      className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90"
                    >
                      Yes, replace
                    </button>
                  </div>
                </>
              )}

              {saveState === "saving" && (
                <p className="text-sm text-gray-600">Saving PDF…</p>
              )}

              {saveState === "saved" && (
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none text-teal">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-navy">PDF saved</p>
                    <p className="mt-0.5 text-sm text-gray-600">
                      Available in{" "}
                      <Link href={recordPaymentHref} onClick={handleRecordPaymentNav} className="font-semibold text-teal hover:underline">
                        Record Payment
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              )}

              {saveState === "error" && (
                <>
                  <p className="text-sm font-semibold text-red-600">Save failed</p>
                  <p className="text-sm text-gray-600">{saveErrorMsg}</p>
                  <button
                    type="button"
                    onClick={closeSavePrompt}
                    className="self-start text-sm font-semibold text-teal hover:underline"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
