"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createJob } from "@/lib/jobs";
import { useJobs } from "@/hooks/useJobs";
import { fetchBillingPlatforms, addBillingPlatform } from "@/lib/billingPlatformsDb";
import type { ParseResult } from "@/lib/yellowcard/parse";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SESSION_KEY = "yellowcard_draft";

type FormState = {
  jobName: string;
  jobNumber: string;
  customer: string;
  customerAddress: string;
  owner: string;
  ownerAddress: string;
  jobAddress: string;
  architect: string;
  architectAddress: string;
  architectProjectNumber: string;
  contractFor: string;
  contractDate: string;
  startDate: string;
  retentionRateCW: string;
  retentionRateSM: string;
  ctiPm: string;
  retentionStepdownThreshold: string;
  retentionStepdownRateCW: string;
  certifiedPayroll: string;
  billingDueDay: string;
  billingCheckinMonth: string;
  billingPlatform: string;
};

export default function ImportReviewPage() {
  const router = useRouter();
  const { jobs, setJobs } = useJobs();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [contractChoice, setContractChoice] = useState<"original" | "tileScope" | null>(null);
  const [billingPlatforms, setBillingPlatforms] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingPlatforms().then(setBillingPlatforms).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data: ParseResult = JSON.parse(raw);
      setParsed(data);
      setForm({
        jobName:                data.draftJob.jobName,
        jobNumber:              data.draftJob.jobNumber,
        customer:               data.draftJob.customer,
        customerAddress:        data.draftJob.customerAddress,
        owner:                  data.draftJob.owner,
        ownerAddress:           data.draftJob.ownerAddress,
        jobAddress:             data.draftJob.jobAddress,
        architect:              data.draftJob.architect,
        architectAddress:       data.draftJob.architectAddress,
        architectProjectNumber: data.draftJob.architectProjectNumber,
        contractFor:            data.draftJob.contractFor,
        contractDate:           data.draftJob.contractDate,
        startDate:              data.draftJob.startDate,
        retentionRateCW:        String(data.draftJob.retentionRateCW),
        retentionRateSM:        String(data.draftJob.retentionRateSM),
        ctiPm:                  "",
        retentionStepdownThreshold: "",
        retentionStepdownRateCW:    "",
        certifiedPayroll:           "no",
        billingDueDay:              "15",
        billingCheckinMonth:        new Date().toISOString().slice(0, 7),
        billingPlatform:            "",
      });
    } catch {
      // Corrupted sessionStorage — user will see the "no data" state
    }
  }, []);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleConfirm() {
    if (!form || !parsed || !contractChoice) return;
    setSaveError(null);

    const duplicate = jobs.find((j) => j.jobNumber === form.jobNumber);
    if (duplicate) {
      setSaveError(`Job # "${form.jobNumber}" is already in use by "${duplicate.customer}". Change the Job # above before confirming.`);
      return;
    }

    setIsSaving(true);
    try {
      if (form.billingPlatform.trim()) {
        await addBillingPlatform(form.billingPlatform.trim());
      }
      const saved = await createJob({
        jobName:                form.jobName,
        jobNumber:              form.jobNumber,
        customer:               form.customer,
        customerAddress:        form.customerAddress,
        gcId:                   null,
        paymentTerms:           "",
        owner:                  form.owner,
        ownerAddress:           form.ownerAddress,
        jobAddress:             form.jobAddress,
        architect:              form.architect,
        architectAddress:       form.architectAddress,
        architectProjectNumber: form.architectProjectNumber,
        contractFor:            form.contractFor,
        contractValue:          contractChoice === "original" ? parsed.originalContract : parsed.tileScopeValue,
        contractDate:           form.contractDate,
        startDate:              form.startDate,
        retentionRateCW:        Number(form.retentionRateCW) || 0,
        retentionRateSM:        Number(form.retentionRateSM) || 0,
        ctiPm:                  form.ctiPm,
        retentionStepdownThreshold: form.retentionStepdownThreshold !== "" ? Number(form.retentionStepdownThreshold) : null,
        retentionStepdownRateCW:    form.retentionStepdownRateCW !== "" ? Number(form.retentionStepdownRateCW) : null,
        certifiedPayroll:           form.certifiedPayroll === "yes",
        billingDueDay:              Number(form.billingDueDay) || 15,
        billingCheckinMonth:        form.billingCheckinMonth || new Date().toISOString().slice(0, 7),
        billingPlatform:            form.billingPlatform.trim(),
      });
      setJobs((prev) => [saved, ...prev]);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem("sov_initial_job", saved.jobNumber);
      router.push("/sov");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create job.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── No data state ──────────────────────────────────────────────────────────
  if (!parsed || !form) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Import Review</h1>
        <p className="text-sm text-gray-500">
          No Yellowcard data to review. Upload a file from the{" "}
          <button
            type="button"
            onClick={() => router.push("/job-setup")}
            className="font-semibold text-teal underline"
          >
            Job Setup page
          </button>
          .
        </p>
      </div>
    );
  }

  const { warnings, originalContract, tileScopeValue, extras } = parsed;
  const missingRequiredLabels: string[] = [];
  if (!form.customerAddress.trim()) missingRequiredLabels.push("Customer billing address");
  if (!form.jobAddress.trim()) missingRequiredLabels.push("Job / site address");
  if (!form.contractFor.trim()) missingRequiredLabels.push("Contract for (scope of work)");
  if (!form.contractDate.trim()) missingRequiredLabels.push("Contract / award date");
  if (form.retentionRateCW.trim() === "") missingRequiredLabels.push("Retention — completed work (%)");
  if (form.retentionRateSM.trim() === "") missingRequiredLabels.push("Retention — stored materials (%)");
  if (!form.ctiPm.trim()) missingRequiredLabels.push("Project manager");
  if (!form.billingDueDay.trim()) missingRequiredLabels.push("Billing due day");
  if (!form.billingPlatform.trim()) missingRequiredLabels.push("Billing platform");
  const canConfirm =
    contractChoice !== null && form.jobNumber.trim().length > 0 && missingRequiredLabels.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Review imported job</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields pre-filled from the Yellowcard. Every field is editable — check them, then confirm to create the job.
        </p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            {warnings.length === 1 ? "1 gap found" : `${warnings.length} gaps found`} — review before confirming:
          </p>
          <ul className="list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Contract value — REQUIRED choice */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-navy">
          Contract value — choose one <span className="text-red-500">*</span>
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          The Yellowcard has two different dollar amounts. You must pick which one is the correct contract value for billing.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${contractChoice === "original" ? "border-teal bg-teal/5" : "border-gray-200 hover:border-gray-300"}`}>
            <input
              type="radio"
              name="contractValue"
              value="original"
              checked={contractChoice === "original"}
              onChange={() => setContractChoice("original")}
              className="mt-0.5 h-4 w-4 accent-teal"
            />
            <div>
              <p className="text-sm font-semibold text-navy">
                {currency.format(originalContract)} — Original Contract
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                From JOB INFO cell M10. This is the full subcontract value including all scopes.
              </p>
            </div>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${contractChoice === "tileScope" ? "border-teal bg-teal/5" : "border-gray-200 hover:border-gray-300"}`}>
            <input
              type="radio"
              name="contractValue"
              value="tileScope"
              checked={contractChoice === "tileScope"}
              onChange={() => setContractChoice("tileScope")}
              className="mt-0.5 h-4 w-4 accent-teal"
            />
            <div>
              <p className="text-sm font-semibold text-navy">
                {currency.format(tileScopeValue)} — Tile Scope Value
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                From YELLOW CARD cell C35. This is the tile-only scope, excluding other trades.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Job fields */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-navy">Job details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField
              label="Job Name *"
              id="jobName"
              required
              value={form.jobName}
              onChange={(e) => handleChange("jobName", e.target.value)}
              placeholder="e.g. Harbor Federal – Lobby Tile"
            />
          </div>
          <TextField
            label="Job # (your internal number) *"
            id="jobNumber"
            required
            value={form.jobNumber}
            onChange={(e) => handleChange("jobNumber", e.target.value)}
          />
          <TextField
            label="Customer (GC name) *"
            id="customer"
            required
            value={form.customer}
            onChange={(e) => handleChange("customer", e.target.value)}
          />
          <TextField
            label="Customer billing address *"
            id="customerAddress"
            required
            value={form.customerAddress}
            onChange={(e) => handleChange("customerAddress", e.target.value)}
          />
          <TextField
            label="Job / site address *"
            id="jobAddress"
            required
            value={form.jobAddress}
            onChange={(e) => handleChange("jobAddress", e.target.value)}
          />
          <TextField
            label="Owner"
            id="owner"
            value={form.owner}
            onChange={(e) => handleChange("owner", e.target.value)}
          />
          <TextField
            label="Owner address"
            id="ownerAddress"
            value={form.ownerAddress}
            onChange={(e) => handleChange("ownerAddress", e.target.value)}
          />
          <TextField
            label="Architect (not in file — fill in if needed)"
            id="architect"
            value={form.architect}
            onChange={(e) => handleChange("architect", e.target.value)}
          />
          <TextField
            label="GC project #"
            id="architectProjectNumber"
            value={form.architectProjectNumber}
            onChange={(e) => handleChange("architectProjectNumber", e.target.value)}
          />
          <TextField
            label="Contract for (scope of work) *"
            id="contractFor"
            required
            value={form.contractFor}
            onChange={(e) => handleChange("contractFor", e.target.value)}
          />
          <TextField
            label="Contract / award date *"
            id="contractDate"
            type="date"
            required
            value={form.contractDate}
            onChange={(e) => handleChange("contractDate", e.target.value)}
          />
          <div />
          <TextField
            label="Retention — completed work (%) *"
            id="retentionRateCW"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={form.retentionRateCW}
            onChange={(e) => handleChange("retentionRateCW", e.target.value)}
          />
          <TextField
            label="Retention — stored materials (%) *"
            id="retentionRateSM"
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={form.retentionRateSM}
            onChange={(e) => handleChange("retentionRateSM", e.target.value)}
          />
          <TextField
            label="Start date (not in file)"
            id="startDate"
            type="date"
            value={form.startDate}
            onChange={(e) => handleChange("startDate", e.target.value)}
          />
          <TextField
            label="Step-down threshold — % complete (not in file, optional)"
            id="retentionStepdownThreshold"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="e.g. 50 — when job reaches this % complete, retention steps down"
            value={form.retentionStepdownThreshold}
            onChange={(e) => handleChange("retentionStepdownThreshold", e.target.value)}
          />
          <TextField
            label="Step-down rate — completed work (%) (not in file, optional)"
            id="retentionStepdownRateCW"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="e.g. 5 — reduced rate once threshold is met"
            value={form.retentionStepdownRateCW}
            onChange={(e) => handleChange("retentionStepdownRateCW", e.target.value)}
          />
          <TextField
            label="Project manager (not in file) *"
            id="ctiPm"
            required
            value={form.ctiPm}
            onChange={(e) => handleChange("ctiPm", e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="certifiedPayroll" className="text-sm font-medium text-navy">
              Certified payroll job? (not in file)
            </label>
            <select
              id="certifiedPayroll"
              value={form.certifiedPayroll}
              onChange={(e) => handleChange("certifiedPayroll", e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <TextField
            label="Billing due day (not in file) *"
            id="billingDueDay"
            type="number"
            min="1"
            max="28"
            step="1"
            placeholder="15"
            required
            value={form.billingDueDay}
            onChange={(e) => handleChange("billingDueDay", e.target.value)}
          />
          <TextField
            label="Next billing check-in month (not in file)"
            id="billingCheckinMonth"
            type="month"
            value={form.billingCheckinMonth}
            onChange={(e) => handleChange("billingCheckinMonth", e.target.value)}
          />
          <div>
            <TextField
              label="Billing platform (not in file) *"
              id="billingPlatform"
              required
              value={form.billingPlatform}
              onChange={(e) => handleChange("billingPlatform", e.target.value)}
              placeholder="e.g. Procore, GCPay, Email…"
              list="billing-platform-list"
            />
            <datalist id="billing-platform-list">
              {billingPlatforms.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {/* Extra info from the file — read-only reference */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-bold text-navy">Additional info from Yellowcard</h2>
        <p className="mb-4 text-sm text-gray-500">
          These fields were extracted but don't have a place in the job record — keep them handy for reference.
        </p>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["PO number",           extras.poNumber],
            ["GC PM",               extras.gcPmName],
            ["GC PM email",         extras.gcPmEmail],
            ["GC phone",            extras.gcPhone],
            ["Project manager", extras.ctiPmName],
            ["CTI email",           extras.ctiEmail],
            ["CTI phone",           extras.ctiPhone],
            ["Estimator",           extras.estimator],
            ["County",              extras.county],
            ["Owner contact",       extras.ownerContact],
            ["Owner phone",         extras.ownerPhone],
            ["OH&P %",              extras.ohAndPPercent ? `${extras.ohAndPPercent}%` : ""],
            ["Change order rate",   extras.changeOrderRatePercent ? `${extras.changeOrderRatePercent}%` : ""],
          ]
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-gray-400">{label}</dt>
                <dd className="font-medium text-navy">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      {/* SOV notice */}
      <div className="rounded-xl border border-teal/30 bg-teal/5 p-4">
        <p className="text-sm font-semibold text-teal">Schedule of Values not included</p>
        <p className="mt-1 text-sm text-gray-600">
          The Yellowcard doesn't contain a billable Schedule of Values — that's entered separately. After you create
          this job, you'll be taken to the SOV page to enter your line items.
        </p>
      </div>

      {/* Actions */}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      {!canConfirm && !contractChoice && (
        <p className="text-sm text-red-500">Choose a contract value above before confirming.</p>
      )}
      {!canConfirm && contractChoice && !form.jobNumber.trim() && (
        <p className="text-sm text-red-500">Enter a Job # before confirming.</p>
      )}
      {!canConfirm && contractChoice && form.jobNumber.trim() && missingRequiredLabels.length > 0 && (
        <p className="text-sm text-red-500">
          Fill in required fields before confirming: {missingRequiredLabels.join(", ")}.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || isSaving}
          className="w-auto px-6"
        >
          {isSaving ? "Creating job…" : "Confirm and create job"}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/job-setup")}
          disabled={isSaving}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
        >
          Back to Job Setup
        </button>
      </div>
    </div>
  );
}
