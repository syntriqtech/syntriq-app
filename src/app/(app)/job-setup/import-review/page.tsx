"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { createJob } from "@/lib/jobs";
import { useJobs } from "@/hooks/useJobs";
import { fetchBillingPlatforms, addBillingPlatform } from "@/lib/billingPlatformsDb";
import type { ParseResult } from "@/lib/yellowcard/parse";
import { SOVLineItem } from "@/lib/sovData";
import { saveSovItems } from "@/lib/sovLineItemsDb";

const SESSION_KEY = "yellowcard_draft";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatContractInput(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  if (isNaN(n) || raw.trim() === "") return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  contractValue: string;
  contractDate: string;
  startDate: string;
  retentionRateCW: string;
  retentionRateSM: string;
  ctiPm: string;
  retentionStepdownThreshold: string;
  retentionStepdownRateCW: string;
  certifiedPayroll: string;
  paymentTerms: string;
  billingDueDay: string;
  billingCheckinMonth: string;
  billingPlatform: string;
};

export default function ImportReviewPage() {
  const router = useRouter();
  const { jobs, setJobs } = useJobs();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [lineItems, setLineItems] = useState<SOVLineItem[]>([]);
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
      const job = data.draftJob;
      setForm({
        jobName:                job.jobName,
        jobNumber:              job.jobNumber,
        customer:               job.customer,
        customerAddress:        job.customerAddress,
        owner:                  job.owner,
        ownerAddress:           job.ownerAddress,
        jobAddress:             job.jobAddress,
        architect:              job.architect,
        architectAddress:       job.architectAddress,
        architectProjectNumber: job.architectProjectNumber,
        contractFor:            job.contractFor,
        contractValue:          formatContractInput(String(job.contractValue)),
        contractDate:           job.contractDate,
        startDate:              job.startDate,
        retentionRateCW:        String(job.retentionRateCW),
        retentionRateSM:        String(job.retentionRateSM),
        ctiPm:                  job.ctiPm,
        retentionStepdownThreshold: "",
        retentionStepdownRateCW:    "",
        certifiedPayroll:           job.certifiedPayroll ? "yes" : "no",
        paymentTerms:               job.paymentTerms,
        billingDueDay:              String(job.billingDueDay || 15),
        billingCheckinMonth:        job.billingCheckinMonth || new Date().toISOString().slice(0, 7),
        billingPlatform:            job.billingPlatform,
      });
      setLineItems(
        data.sovLineItems.map((line) => ({
          item: line.item,
          description: line.description,
          scheduledValue: line.scheduledValue,
          previousApplications: 0,
          thisPeriod: 0,
          storedMaterials: 0,
        }))
      );
    } catch {
      // Corrupted sessionStorage — user will see the "no data" state
    }
  }, []);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
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

  async function handleConfirm() {
    if (!form) return;
    setSaveError(null);

    const duplicate = jobs.find((j) => j.jobNumber === form.jobNumber);
    if (duplicate) {
      setSaveError(`Job # "${form.jobNumber}" is already in use by "${duplicate.customer}". Change the Job # above before confirming.`);
      return;
    }

    const contractVal = Number(form.contractValue.replace(/,/g, "")) || 0;
    const scheduledTotal = lineItems.reduce((sum, line) => sum + line.scheduledValue, 0);
    if (contractVal > 0 && scheduledTotal > contractVal + 0.01) {
      setSaveError(
        `Schedule of values totals ${currency.format(scheduledTotal)}, which is more than the contract value of ${currency.format(contractVal)}. Adjust the line items below before confirming.`
      );
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
        paymentTerms:           form.paymentTerms,
        owner:                  form.owner,
        ownerAddress:           form.ownerAddress,
        jobAddress:             form.jobAddress,
        architect:              form.architect,
        architectAddress:       form.architectAddress,
        architectProjectNumber: form.architectProjectNumber,
        contractFor:            form.contractFor,
        contractValue:          Number(form.contractValue.replace(/,/g, "")) || 0,
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

      // Pre-fill Application #1's schedule of values from the imported line
      // items, if any were found. Nothing has been billed yet (This Period is
      // 0 on every row) — this just seeds the Scheduled Value column so the
      // user doesn't have to retype what they already typed into the template.
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

  // ── No data state ──────────────────────────────────────────────────────────
  if (!parsed || !form) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-navy">Import Review</h1>
        <p className="text-sm text-gray-500">
          No import data to review. Upload a file from the{" "}
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

  const { warnings } = parsed;
  const missingRequiredLabels: string[] = [];
  if (!form.jobName.trim()) missingRequiredLabels.push("Job Name");
  if (!form.jobNumber.trim()) missingRequiredLabels.push("Job #");
  if (!form.customer.trim()) missingRequiredLabels.push("Customer (GC)");
  if (!form.customerAddress.trim()) missingRequiredLabels.push("Customer billing address");
  if (!form.jobAddress.trim()) missingRequiredLabels.push("Job / site address");
  if (!form.contractFor.trim()) missingRequiredLabels.push("Contract for (scope of work)");
  if (!form.contractValue.trim()) missingRequiredLabels.push("Contract value");
  if (!form.contractDate.trim()) missingRequiredLabels.push("Contract date");
  if (form.retentionRateCW.trim() === "") missingRequiredLabels.push("Retention — completed work (%)");
  if (form.retentionRateSM.trim() === "") missingRequiredLabels.push("Retention — stored materials (%)");
  if (!form.ctiPm.trim()) missingRequiredLabels.push("Project manager");
  if (!form.billingDueDay.trim()) missingRequiredLabels.push("Billing due day");
  if (!form.billingPlatform.trim()) missingRequiredLabels.push("Billing platform");
  const canConfirm = missingRequiredLabels.length === 0;

  const scheduledTotal = lineItems.reduce((sum, line) => sum + line.scheduledValue, 0);
  const contractVal = Number(form.contractValue.replace(/,/g, "")) || 0;
  const overContract = contractVal > 0 && scheduledTotal > contractVal + 0.01;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy">Review imported job</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields pre-filled from your import file. Every field is editable — check them, then confirm to create the job.
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
            label="Job # *"
            id="jobNumber"
            required
            value={form.jobNumber}
            onChange={(e) => handleChange("jobNumber", e.target.value)}
          />
          <TextField
            label="GC project #"
            id="architectProjectNumber"
            value={form.architectProjectNumber}
            onChange={(e) => handleChange("architectProjectNumber", e.target.value)}
          />
          <TextField
            label="Customer (GC) *"
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
            label="Architect"
            id="architect"
            value={form.architect}
            onChange={(e) => handleChange("architect", e.target.value)}
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
            label="Contract for (scope of work) *"
            id="contractFor"
            required
            value={form.contractFor}
            onChange={(e) => handleChange("contractFor", e.target.value)}
          />
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
          />
          <TextField
            label="Contract date *"
            id="contractDate"
            type="date"
            required
            value={form.contractDate}
            onChange={(e) => handleChange("contractDate", e.target.value)}
          />
          <TextField
            label="Start date"
            id="startDate"
            type="date"
            value={form.startDate}
            onChange={(e) => handleChange("startDate", e.target.value)}
          />
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
            label="Project manager *"
            id="ctiPm"
            required
            value={form.ctiPm}
            onChange={(e) => handleChange("ctiPm", e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="certifiedPayroll" className="text-sm font-medium text-navy">
              Certified payroll job?
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
            label="Payment terms"
            id="paymentTerms"
            value={form.paymentTerms}
            onChange={(e) => handleChange("paymentTerms", e.target.value)}
            placeholder="e.g. Net 30, 20th of month via GCPay"
          />
          <TextField
            label="Billing due day (day of month) *"
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
            label="Next billing check-in month"
            id="billingCheckinMonth"
            type="month"
            value={form.billingCheckinMonth}
            onChange={(e) => handleChange("billingCheckinMonth", e.target.value)}
          />
          <div>
            <TextField
              label="Billing platform *"
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

      {/* Schedule of values */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-navy">Schedule of values</h2>
        <p className="mt-1 text-sm text-gray-500">
          {lineItems.length > 0
            ? "Line items found on the SCHEDULE OF VALUES tab — this becomes Application #1's starting schedule of values. Review and edit before confirming."
            : "No line items were found on the SCHEDULE OF VALUES tab. You can build the schedule of values manually after creating the job, from Create Pay App."}
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
                  <td className="px-3 py-3 text-right">{currency.format(scheduledTotal)}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {overContract && (
          <p className="mt-3 text-sm font-medium text-red-600">
            This total can&apos;t exceed the contract value of {currency.format(contractVal)}. It&apos;s currently{" "}
            {currency.format(scheduledTotal - contractVal)} over — adjust the line items above.
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
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      {!canConfirm && (
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
