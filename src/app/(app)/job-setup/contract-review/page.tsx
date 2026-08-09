"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createJob } from "@/lib/jobs";
import { updateJobContractPdf } from "@/lib/jobs";
import { fetchBillingPlatforms, addBillingPlatform } from "@/lib/billingPlatformsDb";
import { fetchGeneralContractors, createGeneralContractor, GeneralContractor } from "@/lib/generalContractorsDb";
import { findBestGcMatch } from "@/lib/gcFuzzyMatch";
import { useJobs } from "@/hooks/useJobs";
import type { ExtractedFields } from "@/app/api/contract/extract/route";
import { SOVLineItem } from "@/lib/sovData";
import { saveSovItems } from "@/lib/sovLineItemsDb";
import GCCombobox from "@/components/GCCombobox";

const SESSION_KEY = "contract_draft";

function formatContractInput(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  if (isNaN(n) || raw.trim() === "") return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type ContractDraft = {
  fields: ExtractedFields;
  pdfUrl: string;
};

// The extracted fields covered by the "X of Y filled / Missing: ..." summary
// banner. sovLineItems is excluded — it's a list, not a found/not-found field,
// and gets its own section below.
type ScalarFieldKey = Exclude<keyof ExtractedFields, "sovLineItems">;

// Human-readable labels for the "Missing: ..." summary banner — keep in sync
// with the form fields below.
const FIELD_LABELS: Record<ScalarFieldKey, string> = {
  jobName: "Job Name",
  customer: "Customer",
  customerAddress: "Customer billing address",
  owner: "Owner",
  ownerAddress: "Owner address",
  jobAddress: "Job / site address",
  architect: "Architect",
  architectProjectNumber: "GC project #",
  contractFor: "Contract for",
  contractValue: "Contract value",
  contractDate: "Contract date",
  startDate: "Start date",
  retentionRateCW: "Retention — completed work (%)",
  retentionRateSM: "Retention — stored materials (%)",
  billingDueDay: "Billing due day",
  ctiPm: "Project manager",
  poNumber: "PO number",
};

// ── Field hint ───────────────────────────────────────────────────────────────
// Shows a green snippet when extraction found the value, or a gray "not found"
// when the field was left blank by the extraction.

function FieldHint({
  snippet,
  wasExtracted,
}: {
  snippet: string | null;
  wasExtracted: boolean;
}) {
  if (snippet) {
    return (
      <p className="mt-1 truncate text-xs text-teal" title={snippet}>
        Found: &ldquo;{snippet}&rdquo;
      </p>
    );
  }
  if (!wasExtracted) {
    return (
      <p className="mt-1 text-xs font-medium text-amber-600">Not found — fill in manually</p>
    );
  }
  return null;
}

// ── Extraction field → form string ───────────────────────────────────────────

function asString(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export default function ContractReviewPage() {
  const router = useRouter();
  const { jobs, setJobs } = useJobs();
  const [draft, setDraft] = useState<ContractDraft | null>(null);

  const [form, setForm] = useState({
    jobName: "",
    jobNumber: "",
    customer: "",
    customerAddress: "",
    owner: "",
    ownerAddress: "",
    jobAddress: "",
    architect: "",
    architectProjectNumber: "",
    contractFor: "",
    contractValue: "",
    contractDate: "",
    startDate: "",
    retentionRateCW: "",
    retentionRateSM: "",
    ctiPm: "",
    billingDueDay: "15",
    billingCheckinMonth: new Date().toISOString().slice(0, 7),
    billingPlatform: "",
    certifiedPayroll: "no",
    paymentTerms: "",
    gcId: null as string | null,
  });

  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [billingPlatforms, setBillingPlatforms] = useState<string[]>([]);
  const [gcs, setGcs] = useState<GeneralContractor[]>([]);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  useEffect(() => {
    fetchBillingPlatforms().then(setBillingPlatforms).catch(() => {});
    fetchGeneralContractors().then(setGcs).catch(() => {});
  }, []);

  function handleSelectGc(gc: GeneralContractor) {
    setForm((prev) => ({
      ...prev,
      customer: gc.name,
      gcId: gc.id,
      customerAddress: prev.customerAddress.trim() ? prev.customerAddress : gc.billingAddress,
      paymentTerms: prev.paymentTerms.trim() ? prev.paymentTerms : gc.paymentTerms,
      retentionRateCW:
        prev.retentionRateCW.trim() === "" && gc.defaultRetentionPct != null
          ? String(gc.defaultRetentionPct)
          : prev.retentionRateCW,
      retentionRateSM:
        prev.retentionRateSM.trim() === "" && gc.defaultRetentionPct != null
          ? String(gc.defaultRetentionPct)
          : prev.retentionRateSM,
      billingPlatform: prev.billingPlatform.trim() ? prev.billingPlatform : gc.billingPlatform,
    }));
    setSuggestionDismissed(true);
  }

  async function handleCreateGc(input: Parameters<typeof createGeneralContractor>[0]) {
    const gc = await createGeneralContractor(input);
    setGcs((prev) => [...prev, gc].sort((a, b) => a.name.localeCompare(b.name)));
    return gc;
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data: ContractDraft = JSON.parse(raw);
      setDraft(data);
      const f = data.fields;
      setForm({
        jobName:            asString(f.jobName?.value),
        jobNumber:          asString(f.poNumber?.value),
        customer:           asString(f.customer?.value),
        customerAddress:    asString(f.customerAddress?.value),
        owner:              asString(f.owner?.value),
        ownerAddress:       asString(f.ownerAddress?.value),
        jobAddress:         asString(f.jobAddress?.value),
        architect:          asString(f.architect?.value),
        architectProjectNumber: asString(f.architectProjectNumber?.value),
        contractFor:        asString(f.contractFor?.value),
        contractValue:      formatContractInput(asString(f.contractValue?.value)),
        contractDate:       asString(f.contractDate?.value),
        startDate:          asString(f.startDate?.value),
        retentionRateCW:    asString(f.retentionRateCW?.value),
        retentionRateSM:    asString(f.retentionRateSM?.value),
        ctiPm:              asString(f.ctiPm?.value),
        billingDueDay:      asString(f.billingDueDay?.value) || "15",
        billingCheckinMonth: new Date().toISOString().slice(0, 7),
        billingPlatform:    "",
        certifiedPayroll:   "no",
        paymentTerms:       "",
        gcId:               null,
      });
      setLineItems(
        (f.sovLineItems ?? []).map((line, index) => ({
          item: line.item?.trim() || String(index + 1),
          description: line.description ?? "",
          scheduledValue: Number(line.scheduledValue) || 0,
          previousApplications: 0,
          thisPeriod: 0,
          storedMaterials: 0,
        }))
      );
    } catch {
      // Corrupted sessionStorage — user will see the "no data" state
    }
  }, []);

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateLineItem(index: number, field: "description" | "scheduledValue", value: string) {
    setLineItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      updated[index] =
        field === "scheduledValue"
          ? { ...item, scheduledValue: Number(value) || 0 }
          : { ...item, description: value };
      return updated;
    });
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { item: String(prev.length + 1), description: "", scheduledValue: 0, previousApplications: 0, thisPeriod: 0, storedMaterials: 0 },
    ]);
  }

  // Helper to check if a field was populated by extraction
  function wasExtracted(key: ScalarFieldKey): boolean {
    return draft?.fields[key]?.value !== null && draft?.fields[key]?.value !== undefined;
  }

  async function handleConfirm() {
    if (!form.jobNumber.trim()) {
      setSaveError("Enter a Job # before confirming.");
      return;
    }
    if (!form.customer.trim()) {
      setSaveError("GC name (Customer) is required.");
      return;
    }
    if (!form.gcId) {
      setSaveError('Confirm the matched GC, pick an existing one, or add it as new, in the "Customer (GC)" field before confirming.');
      return;
    }

    const duplicate = jobs.find((j) => j.jobNumber === form.jobNumber);
    if (duplicate) {
      setSaveError(
        `Job # "${form.jobNumber}" is already in use by "${duplicate.customer}". Change it above.`
      );
      return;
    }

    if (scheduledTotal > contractVal + 0.01) {
      setSaveError(
        `Schedule of values totals ${currency.format(scheduledTotal)}, which is more than the contract value of ${currency.format(contractVal)}. Adjust the line items below before confirming.`
      );
      return;
    }

    if (missingRequiredLabels.length > 0) {
      setSaveError(`Fill in required fields before confirming: ${missingRequiredLabels.join(", ")}.`);
      return;
    }

    setSaveError(null);
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
        gcId:                   form.gcId,
        paymentTerms:           form.paymentTerms,
        owner:                  form.owner,
        ownerAddress:           form.ownerAddress,
        jobAddress:             form.jobAddress,
        architect:              form.architect,
        architectAddress:       "",
        architectProjectNumber: form.architectProjectNumber,
        contractFor:            form.contractFor,
        contractValue:          Number(form.contractValue.replace(/,/g, "")) || 0,
        contractDate:           form.contractDate,
        startDate:              form.startDate,
        retentionRateCW:        Number(form.retentionRateCW) || 0,
        retentionRateSM:        Number(form.retentionRateSM) || 0,
        ctiPm:                  form.ctiPm,
        retentionStepdownThreshold: null,
        retentionStepdownRateCW: null,
        billingDueDay:          Number(form.billingDueDay) || 15,
        billingCheckinMonth:    form.billingCheckinMonth,
        billingPlatform:        form.billingPlatform,
        certifiedPayroll:       form.certifiedPayroll === "yes",
      });

      setJobs((prev) => [saved, ...prev]);

      // Attach the source contract PDF to the job record
      if (draft?.pdfUrl) {
        try {
          await updateJobContractPdf(saved.id, draft.pdfUrl);
        } catch {
          // Non-fatal — job is created, PDF attachment is best-effort
        }
      }

      // Pre-fill Application #1's schedule of values from the extracted line
      // items, if any were found. Nothing has been billed yet (This Period is
      // 0 on every row) — this just seeds the Scheduled Value column so the
      // user doesn't have to retype the contract's cost breakdown by hand.
      if (lineItems.length > 0) {
        try {
          const today = todayIsoDate();
          await saveSovItems(saved.id, "1", today, today, lineItems, []);
        } catch {
          // Non-fatal — job is created, SOV pre-fill is best-effort; the user
          // can still build the schedule of values manually from /sov.
        }
      }

      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem("sov_initial_job", saved.jobNumber);
      router.push("/sov");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create job.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── No data state ─────────────────────────────────────────────────────────

  if (!draft) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Review Extracted Contract</h1>
        <p className="text-sm text-gray-500">
          No contract data to review.{" "}
          <button
            type="button"
            onClick={() => router.push("/job-setup")}
            className="font-semibold text-teal underline"
          >
            Return to Job Setup
          </button>
          .
        </p>
      </div>
    );
  }

  const f = draft.fields;
  const scheduledTotal = lineItems.reduce((sum, line) => sum + line.scheduledValue, 0);
  const contractVal = Number(form.contractValue.replace(/,/g, "")) || 0;
  const overContract = contractVal > 0 && scheduledTotal > contractVal + 0.01;
  // Suggest a fuzzy GC match once both the extracted customer name and the
  // GC directory are available — never auto-links, only surfaces a suggestion
  // the user must confirm.
  const suggestedGc =
    !form.gcId && !suggestionDismissed ? findBestGcMatch(form.customer, gcs)?.gc ?? null : null;

  const missingRequiredLabels: string[] = [];
  if (!form.jobName.trim()) missingRequiredLabels.push("Job Name");
  if (!form.jobAddress.trim()) missingRequiredLabels.push("Job / site address");
  if (!form.customerAddress.trim()) missingRequiredLabels.push("Customer billing address");
  if (!form.gcId) missingRequiredLabels.push("Customer (GC) — confirm a match or add new");
  if (!form.contractFor.trim()) missingRequiredLabels.push("Contract for (scope of work)");
  if (!form.contractValue.trim()) missingRequiredLabels.push("Contract value");
  if (!form.contractDate.trim()) missingRequiredLabels.push("Contract date");
  if (form.retentionRateCW.trim() === "") missingRequiredLabels.push("Retention — completed work (%)");
  if (form.retentionRateSM.trim() === "") missingRequiredLabels.push("Retention — stored materials (%)");
  if (!form.ctiPm.trim()) missingRequiredLabels.push("Project manager");
  if (!form.billingDueDay.trim()) missingRequiredLabels.push("Billing due day");
  if (!form.billingPlatform.trim()) missingRequiredLabels.push("Billing platform");
  const scalarKeys = Object.keys(FIELD_LABELS) as ScalarFieldKey[];
  const extractedCount = scalarKeys.filter((k) => f[k]?.value !== null && f[k]?.value !== undefined).length;
  const totalFields = scalarKeys.length;
  const missingLabels = scalarKeys
    .filter((k) => f[k]?.value === null || f[k]?.value === undefined)
    .map((k) => FIELD_LABELS[k]);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Review extracted contract</h1>
        <p className="mt-1 text-sm text-gray-500">
          {extractedCount} of {totalFields} fields filled from document.
          {missingLabels.length > 0 && <> Missing: {missingLabels.join(", ")}.</>}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Every field is editable. Add a Job # and confirm to create the job.
        </p>
      </div>

      {/* Extraction legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm text-xs">
        <span className="font-semibold text-gray-500">Key:</span>
        <span className="flex items-center gap-1.5 text-teal">
          <span className="inline-block h-2 w-2 rounded-full bg-teal" />
          Found in contract
        </span>
        <span className="flex items-center gap-1.5 text-amber-600">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          Not found — fill in manually
        </span>
        {draft.pdfUrl && (
          <a
            href={draft.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-semibold text-teal hover:underline"
          >
            View uploaded contract ↗
          </a>
        )}
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-navy">Job details</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">

          {/* Job Name */}
          <div className="sm:col-span-2">
            <TextField
              label="Job Name *"
              id="jobName"
              required
              value={form.jobName}
              onChange={(e) => handleChange("jobName", e.target.value)}
              placeholder="e.g. Harbor Federal – Lobby Tile"
              highlight={!wasExtracted("jobName")}
            />
            <FieldHint snippet={f.jobName?.snippet} wasExtracted={wasExtracted("jobName")} />
          </div>

          {/* Job # — suggested from a PO number in the document, if found; otherwise assign manually */}
          <div>
            <TextField
              label="Job # (your internal number) *"
              id="jobNumber"
              required
              value={form.jobNumber}
              onChange={(e) => handleChange("jobNumber", e.target.value)}
              placeholder="e.g. J-2401"
              highlight={!f.poNumber?.value}
            />
            {f.poNumber?.value ? (
              <p className="mt-1 truncate text-xs text-teal" title={f.poNumber.snippet ?? undefined}>
                Suggested from PO number in the document — change if this isn&apos;t your internal job number.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-600">
                No PO number found — assign your internal job number manually.
              </p>
            )}
          </div>

          {/* GC Project # */}
          <div>
            <TextField
              label="GC project #"
              id="architectProjectNumber"
              value={form.architectProjectNumber}
              onChange={(e) => handleChange("architectProjectNumber", e.target.value)}
              highlight={!wasExtracted("architectProjectNumber")}
            />
            <FieldHint
              snippet={f.architectProjectNumber?.snippet}
              wasExtracted={wasExtracted("architectProjectNumber")}
            />
          </div>

          {/* Job address */}
          <div>
            <TextField
              label="Job / site address *"
              id="jobAddress"
              required
              value={form.jobAddress}
              onChange={(e) => handleChange("jobAddress", e.target.value)}
              highlight={!wasExtracted("jobAddress")}
            />
            <FieldHint snippet={f.jobAddress?.snippet} wasExtracted={wasExtracted("jobAddress")} />
          </div>

          {/* Architect */}
          <div>
            <TextField
              label="Architect"
              id="architect"
              value={form.architect}
              onChange={(e) => handleChange("architect", e.target.value)}
              highlight={!wasExtracted("architect")}
            />
            <FieldHint snippet={f.architect?.snippet} wasExtracted={wasExtracted("architect")} />
          </div>

          {/* Customer / GC */}
          <div>
            <GCCombobox
              id="customer"
              label="Customer (GC name) *"
              gcs={gcs}
              query={form.customer}
              selectedId={form.gcId}
              onQueryChange={(value) => {
                setForm((prev) => ({ ...prev, customer: value, gcId: null }));
                setSuggestionDismissed(false);
              }}
              onSelect={handleSelectGc}
              onCreate={handleCreateGc}
              required
            />
            <FieldHint snippet={f.customer?.snippet} wasExtracted={wasExtracted("customer")} />

            {suggestedGc && !form.gcId && (
              <div className="mt-2 rounded-lg border border-teal/30 bg-teal/5 p-3">
                <p className="text-sm text-navy">
                  Is this the same GC as a saved record: <span className="font-semibold">{suggestedGc.name}</span>?
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectGc(suggestedGc)}
                    className="text-sm font-semibold text-teal hover:underline"
                  >
                    Yes, this is {suggestedGc.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestionDismissed(true)}
                    className="text-sm font-semibold text-gray-500 hover:underline"
                  >
                    No — pick a different GC or add new
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Customer address */}
          <div>
            <TextField
              label="Customer billing address *"
              id="customerAddress"
              required
              value={form.customerAddress}
              onChange={(e) => handleChange("customerAddress", e.target.value)}
              highlight={!wasExtracted("customerAddress")}
            />
            <FieldHint
              snippet={f.customerAddress?.snippet}
              wasExtracted={wasExtracted("customerAddress")}
            />
          </div>

          {/* Owner */}
          <div>
            <TextField
              label="Owner"
              id="owner"
              value={form.owner}
              onChange={(e) => handleChange("owner", e.target.value)}
              highlight={!wasExtracted("owner")}
            />
            <FieldHint snippet={f.owner?.snippet} wasExtracted={wasExtracted("owner")} />
          </div>

          {/* Owner address */}
          <div>
            <TextField
              label="Owner address"
              id="ownerAddress"
              value={form.ownerAddress}
              onChange={(e) => handleChange("ownerAddress", e.target.value)}
              highlight={!wasExtracted("ownerAddress")}
            />
            <FieldHint snippet={f.ownerAddress?.snippet} wasExtracted={wasExtracted("ownerAddress")} />
          </div>

          {/* Contract for */}
          <div className="sm:col-span-2">
            <TextField
              label="Contract for (scope of work) *"
              id="contractFor"
              required
              value={form.contractFor}
              onChange={(e) => handleChange("contractFor", e.target.value)}
              highlight={!wasExtracted("contractFor")}
            />
            <FieldHint snippet={f.contractFor?.snippet} wasExtracted={wasExtracted("contractFor")} />
          </div>

          {/* Contract value */}
          <div>
            <TextField
              label="Contract value *"
              id="contractValue"
              prefix="$"
              inputMode="decimal"
              required
              value={form.contractValue}
              onChange={(e) => handleChange("contractValue", e.target.value)}
              onFocus={(e) => handleChange("contractValue", e.target.value.replace(/,/g, ""))}
              onBlur={(e) => handleChange("contractValue", formatContractInput(e.target.value))}
              highlight={!wasExtracted("contractValue")}
            />
            <FieldHint
              snippet={f.contractValue?.snippet}
              wasExtracted={wasExtracted("contractValue")}
            />
          </div>

          {/* Contract date */}
          <div>
            <TextField
              label="Contract date *"
              id="contractDate"
              type="date"
              required
              value={form.contractDate}
              onChange={(e) => handleChange("contractDate", e.target.value)}
              highlight={!wasExtracted("contractDate")}
            />
            <FieldHint
              snippet={f.contractDate?.snippet}
              wasExtracted={wasExtracted("contractDate")}
            />
          </div>

          {/* Start date */}
          <div>
            <TextField
              label="Start date"
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => handleChange("startDate", e.target.value)}
              highlight={!wasExtracted("startDate")}
            />
            <FieldHint snippet={f.startDate?.snippet} wasExtracted={wasExtracted("startDate")} />
          </div>

          {/* Retention CW */}
          <div>
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
              onWheel={(e) => e.currentTarget.blur()}
              highlight={!wasExtracted("retentionRateCW")}
            />
            <FieldHint
              snippet={f.retentionRateCW?.snippet}
              wasExtracted={wasExtracted("retentionRateCW")}
            />
          </div>

          {/* Project manager */}
          <div>
            <TextField
              label="Project manager *"
              id="ctiPm"
              required
              value={form.ctiPm}
              onChange={(e) => handleChange("ctiPm", e.target.value)}
              placeholder="Your PM for this job"
              highlight={!wasExtracted("ctiPm")}
            />
            <FieldHint snippet={f.ctiPm?.snippet} wasExtracted={wasExtracted("ctiPm")} />
          </div>

          {/* Retention SM */}
          <div>
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
              onWheel={(e) => e.currentTarget.blur()}
              highlight={!wasExtracted("retentionRateSM")}
            />
            <FieldHint
              snippet={f.retentionRateSM?.snippet}
              wasExtracted={wasExtracted("retentionRateSM")}
            />
          </div>

          {/* Billing due day */}
          <div>
            <TextField
              label="Billing due day (day of month) *"
              id="billingDueDay"
              type="number"
              min="1"
              max="31"
              required
              value={form.billingDueDay}
              onChange={(e) => handleChange("billingDueDay", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              highlight={!wasExtracted("billingDueDay")}
            />
            <FieldHint
              snippet={f.billingDueDay?.snippet}
              wasExtracted={wasExtracted("billingDueDay")}
            />
          </div>

          {/* Billing platform */}
          <div>
            <TextField
              label="Billing platform *"
              id="billingPlatform"
              required
              value={form.billingPlatform}
              onChange={(e) => handleChange("billingPlatform", e.target.value)}
              placeholder="e.g. Procore, GCPay, Email…"
              list="billing-platform-list"
              highlight={!form.billingPlatform.trim()}
            />
            <datalist id="billing-platform-list">
              {billingPlatforms.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {/* Payment terms */}
          <div>
            <TextField
              label="Payment terms"
              id="paymentTerms"
              value={form.paymentTerms}
              onChange={(e) => handleChange("paymentTerms", e.target.value)}
              placeholder="e.g. Net 30, 20th of month via GCPay"
            />
          </div>
        </div>
      </div>

      {/* Schedule of values */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-navy">Schedule of values</h2>
        <p className="mt-1 text-sm text-gray-500">
          {lineItems.length > 0
            ? "Line items found in the document's cost breakdown — this becomes Application #1's starting schedule of values. Review and edit before confirming."
            : "No itemized cost breakdown was found in this document. You can build the schedule of values manually after creating the job, from Create Pay App."}
        </p>

        {lineItems.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-3 py-2.5 font-medium">Item</th>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 text-right font-medium">Scheduled value</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.map((line, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2 font-semibold text-navy">{line.item}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLineItem(index, "description", e.target.value)}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.scheduledValue}
                        onChange={(e) => updateLineItem(index, "scheduledValue", e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-right text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="text-xs font-medium text-red-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t border-gray-200 font-bold ${overContract ? "bg-red-50 text-red-600" : "bg-gray-50 text-navy"}`}>
                  <td className="px-3 py-3" colSpan={2}>Total</td>
                  <td className="px-3 py-3 text-right">
                    {currency.format(scheduledTotal)}
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {overContract && (
          <p className="mt-3 text-sm font-medium text-red-600">
            This total can&apos;t exceed the contract value of {currency.format(contractVal)}. It&apos;s currently {currency.format(scheduledTotal - contractVal)} over — adjust the line items above.
          </p>
        )}

        <button
          type="button"
          onClick={addLineItem}
          className="mt-3 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-navy hover:bg-gray-50"
        >
          + Add line item
        </button>
      </div>

      {/* Actions */}
      {!saveError && missingRequiredLabels.length > 0 && (
        <p className="text-sm text-red-500">
          Fill in required fields before confirming: {missingRequiredLabels.join(", ")}.
        </p>
      )}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isSaving || overContract || missingRequiredLabels.length > 0}
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
