"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TextField from "@/components/TextField";
import Button from "@/components/Button";
import { JobSetup } from "@/lib/jobSetupData";
import { createJob, DbJob, fetchDeletedJobs, permanentlyDeleteJob, restoreJob, softDeleteJob, updateJob } from "@/lib/jobs";
import { fetchBillingPlatforms, addBillingPlatform } from "@/lib/billingPlatformsDb";
import { fetchGeneralContractors, createGeneralContractor, GeneralContractor } from "@/lib/generalContractorsDb";
import { useJobs } from "@/hooks/useJobs";
import JobCreatedModal from "@/components/JobCreatedModal";
import YellowcardImportModal from "@/components/YellowcardImportModal";
import GCCombobox from "@/components/GCCombobox";

const SESSION_KEY = "yellowcard_draft";
const CONTRACT_SESSION_KEY = "contract_draft";

function formatContractInput(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  if (isNaN(n) || raw.trim() === "") return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EMPTY_FORM = {
  jobName: "",
  jobNumber: "",
  customer: "",
  customerAddress: "",
  gcId: null as string | null,
  paymentTerms: "",
  owner: "",
  ownerAddress: "",
  jobAddress: "",
  architect: "",
  architectAddress: "",
  architectProjectNumber: "",
  contractFor: "",
  contractValue: "",
  contractDate: "",
  startDate: "",
  retentionRateCW: "",
  retentionRateSM: "",
  ctiPm: "",
  retentionStepdownThreshold: "",
  retentionStepdownRateCW: "",
  billingDueDay: "15",
  billingCheckinMonth: new Date().toISOString().slice(0, 7),
  billingPlatform: "",
  certifiedPayroll: "no",
};

function jobToForm(job: DbJob): typeof EMPTY_FORM {
  return {
    jobName: job.jobName,
    jobNumber: job.jobNumber,
    customer: job.customer,
    customerAddress: job.customerAddress,
    gcId: job.gcId,
    paymentTerms: job.paymentTerms ?? "",
    owner: job.owner,
    ownerAddress: job.ownerAddress,
    jobAddress: job.jobAddress,
    architect: job.architect,
    architectAddress: job.architectAddress,
    architectProjectNumber: job.architectProjectNumber,
    contractFor: job.contractFor,
    contractValue: formatContractInput(String(job.contractValue)),
    contractDate: job.contractDate,
    startDate: job.startDate,
    retentionRateCW: String(job.retentionRateCW),
    retentionRateSM: String(job.retentionRateSM),
    ctiPm: job.ctiPm,
    retentionStepdownThreshold: job.retentionStepdownThreshold != null ? String(job.retentionStepdownThreshold) : "",
    retentionStepdownRateCW: job.retentionStepdownRateCW != null ? String(job.retentionStepdownRateCW) : "",
    billingDueDay: String(job.billingDueDay ?? 15),
    billingCheckinMonth: job.billingCheckinMonth ?? new Date().toISOString().slice(0, 7),
    billingPlatform: job.billingPlatform ?? "",
    certifiedPayroll: job.certifiedPayroll ? "yes" : "no",
  };
}

export default function JobSetupPage() {
  const router = useRouter();
  const { jobs, isLoading, setJobs } = useJobs();
  const [form, setForm] = useState(EMPTY_FORM);
  const [billingPlatforms, setBillingPlatforms] = useState<string[]>([]);
  const [gcs, setGcs] = useState<GeneralContractor[]>([]);

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
  }

  async function handleCreateGc(input: Parameters<typeof createGeneralContractor>[0]) {
    const gc = await createGeneralContractor(input);
    setGcs((prev) => [...prev, gc].sort((a, b) => a.name.localeCompare(b.name)));
    return gc;
  }
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  // Prefill "Contract for" from the most recently created job — this value is
  // almost always the same for a given subcontractor's trade, so default it
  // in rather than making the user retype it on every job.
  useEffect(() => {
    if (isLoading || editingJobId || form.contractFor !== "") return;
    const lastValue = jobs[0]?.contractFor;
    if (lastValue) setForm((prev) => ({ ...prev, contractFor: lastValue }));
  }, [isLoading, jobs, editingJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump straight into editing a specific job (e.g. from its job profile page's
  // "Edit job info" link) instead of landing on the blank create form.
  useEffect(() => {
    if (isLoading || jobs.length === 0) return;
    const jobNumber = sessionStorage.getItem("jobsetup_edit_job");
    if (!jobNumber) return;
    sessionStorage.removeItem("jobsetup_edit_job");
    const target = jobs.find((j) => j.jobNumber === jobNumber);
    if (target) handleEditJob(target);
  }, [isLoading, jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showYellowcardModal, setShowYellowcardModal] = useState(false);
  const contractFileInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletedJobs, setDeletedJobs] = useState<DbJob[]>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<"jobNumber" | "customer">("jobNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [createdJob, setCreatedJob] = useState<DbJob | null>(null);
  const [showCreatedToast, setShowCreatedToast] = useState(false);

  function handleSort(col: "jobNumber" | "customer") {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const sortedJobs = [...jobs].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "jobNumber") {
      const na = parseFloat(a.jobNumber);
      const nb = parseFloat(b.jobNumber);
      if (!isNaN(na) && !isNaN(nb)) {
        cmp = na - nb;
      } else {
        cmp = a.jobNumber.localeCompare(b.jobNumber);
      }
    } else {
      cmp = a.customer.localeCompare(b.customer);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  async function handleDelete(jobId: string) {
    try {
      await softDeleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setConfirmDeleteId(null);
      if (editingJobId === jobId) handleCancelEdit();
      // Refresh the deleted list if it's already open
      if (showDeleted) loadDeletedJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete job.");
    }
  }

  async function loadDeletedJobs() {
    setIsLoadingDeleted(true);
    try {
      setDeletedJobs(await fetchDeletedJobs());
    } finally {
      setIsLoadingDeleted(false);
    }
  }

  async function handleToggleDeleted() {
    if (!showDeleted) await loadDeletedJobs();
    setShowDeleted((prev) => !prev);
  }

  async function handleRestore(jobId: string) {
    try {
      const restored = await restoreJob(jobId);
      setDeletedJobs((prev) => prev.filter((j) => j.id !== jobId));
      setJobs((prev) => [restored, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore job.");
    }
  }

  async function handlePermanentDelete(jobId: string) {
    try {
      await permanentlyDeleteJob(jobId);
      setDeletedJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete job.");
    }
  }

  async function handleYellowcardFile(file: File) {
    setIsImporting(true);
    setImportError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/yellowcard/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed.");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(json));
      setShowYellowcardModal(false);
      router.push("/job-setup/import-review");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not import file.");
      setShowYellowcardModal(false);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleContractFile(file: File) {
    setIsExtracting(true);
    setContractError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/contract/extract", { method: "POST", body });
      const json = await res.json();
      if (json.fallback) {
        setContractError(json.error ?? "Could not extract contract data.");
        return;
      }
      sessionStorage.setItem(
        CONTRACT_SESSION_KEY,
        JSON.stringify({ fields: json.fields, pdfUrl: json.pdfUrl })
      );
      router.push("/job-setup/contract-review");
    } catch (err) {
      setContractError(err instanceof Error ? err.message : "Could not extract contract data.");
    } finally {
      setIsExtracting(false);
      if (contractFileInputRef.current) contractFileInputRef.current.value = "";
    }
  }

  function handleChange(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleEditJob(job: DbJob) {
    setEditingJobId(job.id);
    setForm(jobToForm(job));
    setError(null);
  }

  function handleCancelEdit() {
    setEditingJobId(null);
    setForm({ ...EMPTY_FORM, contractFor: jobs[0]?.contractFor ?? "" });
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const duplicate = jobs.find(
      (j) => j.jobNumber === form.jobNumber && j.id !== editingJobId
    );
    if (duplicate) {
      setError(`Job # "${form.jobNumber}" is already in use by "${duplicate.customer}". Each job must have a unique job number.`);
      return;
    }

    if (!form.gcId) {
      setError('Select the GC from the "Customer" list, or add it as a new GC, before saving.');
      return;
    }

    const jobData: JobSetup = {
      jobName: form.jobName,
      jobNumber: form.jobNumber,
      customer: form.customer,
      customerAddress: form.customerAddress,
      gcId: form.gcId,
      paymentTerms: form.paymentTerms,
      owner: form.owner,
      ownerAddress: form.ownerAddress,
      jobAddress: form.jobAddress,
      architect: form.architect,
      architectAddress: form.architectAddress,
      architectProjectNumber: form.architectProjectNumber,
      contractFor: form.contractFor,
      contractValue: Number(form.contractValue.replace(/,/g, "")) || 0,
      contractDate: form.contractDate,
      startDate: form.startDate,
      retentionRateCW: Number(form.retentionRateCW) || 0,
      retentionRateSM: Number(form.retentionRateSM) || 0,
      ctiPm: form.ctiPm,
      retentionStepdownThreshold: form.retentionStepdownThreshold !== "" ? Number(form.retentionStepdownThreshold) : null,
      retentionStepdownRateCW: form.retentionStepdownRateCW !== "" ? Number(form.retentionStepdownRateCW) : null,
      billingDueDay: Number(form.billingDueDay) || 15,
      billingCheckinMonth: form.billingCheckinMonth || new Date().toISOString().slice(0, 7),
      billingPlatform: form.billingPlatform.trim(),
      certifiedPayroll: form.certifiedPayroll === "yes",
    };

    setIsSaving(true);
    try {
      if (form.billingPlatform.trim()) {
        await addBillingPlatform(form.billingPlatform.trim());
        const updated = await fetchBillingPlatforms();
        setBillingPlatforms(updated);
      }
      let savedContractFor = "";
      if (editingJobId) {
        const saved = await updateJob(editingJobId, jobData);
        setJobs((prev) => prev.map((j) => (j.id === editingJobId ? saved : j)));
        setEditingJobId(null);
        savedContractFor = saved.contractFor;
      } else {
        const saved = await createJob(jobData);
        setJobs((prev) => [saved, ...prev]);
        setCreatedJob(saved);
        savedContractFor = saved.contractFor;
      }
      setForm({ ...EMPTY_FORM, contractFor: savedContractFor });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save job.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditSovNow() {
    if (!createdJob) return;
    sessionStorage.setItem("sov_initial_job", createdJob.jobNumber);
    sessionStorage.setItem("sov_start_next_app", "1");
    setCreatedJob(null);
    router.push("/sov");
  }

  function handleDismissCreatedModal() {
    setCreatedJob(null);
    setShowCreatedToast(true);
    setTimeout(() => setShowCreatedToast(false), 3000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Job Setup</h1>
          <p className="mt-1 text-sm text-gray-500">
            {editingJobId
              ? "Editing an existing project — update the fields below, then save."
              : "Create a new project and keep track of the ones already on the books."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setShowYellowcardModal(true)}
            disabled={isImporting}
            className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10 disabled:opacity-50"
          >
            {isImporting ? "Reading file…" : "Job Import"}
          </button>
          <input
            ref={contractFileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleContractFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => contractFileInputRef.current?.click()}
            disabled={isExtracting}
            className="rounded-lg border border-teal px-4 py-2.5 text-sm font-semibold text-teal hover:bg-teal/10 disabled:opacity-50"
          >
            {isExtracting ? "Reading contract…" : "Import Contract (AI)"}
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-800">Job import failed</p>
              <p className="mt-1 text-sm text-red-700">{importError}</p>
            </div>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="flex-none text-red-400 hover:text-red-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {contractError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-800">Contract extraction failed</p>
              <p className="mt-1 text-sm text-red-700">{contractError}</p>
              <p className="mt-1 text-sm text-red-600">You can fill in the form below manually.</p>
            </div>
            <button
              type="button"
              onClick={() => setContractError(null)}
              className="flex-none text-red-400 hover:text-red-600 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:grid-cols-2"
      >
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
        <GCCombobox
          id="customer"
          label="Customer (GC) *"
          gcs={gcs}
          query={form.customer}
          selectedId={form.gcId}
          onQueryChange={(value) => setForm((prev) => ({ ...prev, customer: value, gcId: null }))}
          onSelect={handleSelectGc}
          onCreate={handleCreateGc}
          required
          placeholder="Start typing a GC name…"
        />
        <TextField
          label="Customer billing address *"
          id="customerAddress"
          required
          value={form.customerAddress}
          onChange={(e) => handleChange("customerAddress", e.target.value)}
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
          label="Retention rate — completed work (%) *"
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
          label="Retention rate — stored materials (%) *"
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
          label="Start date"
          id="startDate"
          type="date"
          value={form.startDate}
          onChange={(e) => handleChange("startDate", e.target.value)}
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

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" className="w-auto px-6" disabled={isSaving}>
            {isSaving ? "Saving…" : editingJobId ? "Save changes" : "Create job"}
          </Button>
          {editingJobId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-navy">Existing jobs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="px-6 py-3 font-medium">Job Name</th>
                <th className="px-6 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("jobNumber")}
                    className="flex items-center gap-1 hover:text-navy"
                  >
                    Job #
                    <span className="text-xs">
                      {sortBy === "jobNumber" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
                <th className="px-6 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("customer")}
                    className="flex items-center gap-1 hover:text-navy"
                  >
                    Customer
                    <span className="text-xs">
                      {sortBy === "customer" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
                <th className="px-6 py-3 font-medium">Contract value</th>
                <th className="px-6 py-3 font-medium">Retention (CW / SM)</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td className="px-6 py-3 text-gray-500" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && jobs.length === 0 && (
                <tr>
                  <td className="px-6 py-3 text-gray-500" colSpan={6}>
                    No jobs yet — create your first one above.
                  </td>
                </tr>
              )}
              {sortedJobs.map((job) => (
                <tr key={job.id} className={editingJobId === job.id ? "bg-teal/5" : undefined}>
                  <td className="px-6 py-3 font-semibold text-navy">
                    {job.jobName || (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-sm">
                        ⚠ No job name — click Edit
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{job.jobNumber}</td>
                  <td className="px-6 py-3 text-navy">{job.customer}</td>
                  <td className="px-6 py-3 text-navy">{currency.format(job.contractValue)}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {job.retentionRateCW}% / {job.retentionRateSM}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    {confirmDeleteId === job.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-sm text-gray-500">Delete job {job.jobNumber}?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(job.id)}
                          className="text-sm font-semibold text-red-600 hover:underline"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-sm font-semibold text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-4">
                        <button
                          type="button"
                          onClick={() => handleEditJob(job)}
                          className="text-sm font-semibold text-teal hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(job.id)}
                          className="text-sm font-semibold text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recently deleted */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={handleToggleDeleted}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <h2 className="text-base font-bold text-navy">Recently deleted</h2>
          <span className="text-sm text-gray-400">{showDeleted ? "Hide" : "Show"}</span>
        </button>

        {showDeleted && (
          <div className="border-t border-gray-100">
            {isLoadingDeleted ? (
              <p className="px-6 py-4 text-sm text-gray-500">Loading…</p>
            ) : deletedJobs.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-500">No deleted jobs.</p>
            ) : (
              <>
                <p className="px-6 pt-3 text-xs text-gray-400">
                  These jobs are hidden from everywhere in the app. Restore a job to bring it back, or delete permanently to remove it for good.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="px-6 py-3 font-medium">Job #</th>
                        <th className="px-6 py-3 font-medium">Customer</th>
                        <th className="px-6 py-3 font-medium">Contract value</th>
                        <th className="px-6 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {deletedJobs.map((job) => (
                        <tr key={job.id} className="opacity-60">
                          <td className="px-6 py-3 font-semibold text-navy">{job.jobName || job.jobNumber}</td>
                          <td className="px-6 py-3 text-gray-500">{job.jobNumber}</td>
                          <td className="px-6 py-3 text-navy">{currency.format(job.contractValue)}</td>
                          <td className="px-6 py-3 text-right">
                            <span className="flex items-center justify-end gap-4">
                              <button
                                type="button"
                                onClick={() => handleRestore(job.id)}
                                className="text-sm font-semibold text-teal hover:underline"
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePermanentDelete(job.id)}
                                className="text-sm font-semibold text-red-500 hover:underline"
                              >
                                Delete permanently
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {createdJob && (
        <JobCreatedModal onYes={handleEditSovNow} onClose={handleDismissCreatedModal} />
      )}

      {showYellowcardModal && (
        <YellowcardImportModal
          isImporting={isImporting}
          onFile={handleYellowcardFile}
          onClose={() => setShowYellowcardModal(false)}
        />
      )}

      {showCreatedToast && (
        <div className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none text-teal">✓</span>
            <p className="text-sm font-semibold text-navy">Job created successfully</p>
          </div>
        </div>
      )}
    </div>
  );
}
