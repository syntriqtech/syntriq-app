"use client";

import { useRef, useState } from "react";
import { DbJob } from "@/lib/jobs";
import { createChangeOrder, ChangeOrder } from "@/lib/changeOrdersDb";
import { findBestJobMatch } from "@/lib/jobFuzzyMatch";
import type { ExtractedCoFields } from "@/app/api/change-order/extract/route";

type Props = {
  jobs: DbJob[];
  defaultJobId?: string;
  onClose: () => void;
  onCreated: (co: ChangeOrder) => void;
};

type ScalarFieldKey = keyof ExtractedCoFields;

const FIELD_LABELS: Record<ScalarFieldKey, string> = {
  corNumber: "COR number",
  jobReference: "Job",
  description: "Description",
  date: "Date",
  materialsAmount: "Materials/equipment amount",
  laborAmount: "Labor amount",
  markupAmount: "Markup/overhead amount",
  totalAmount: "Total amount",
};

function asString(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function FieldHint({ snippet, wasExtracted }: { snippet: string | null; wasExtracted: boolean }) {
  if (snippet) {
    return (
      <p className="mt-1 truncate text-xs text-teal" title={snippet}>
        Found: &ldquo;{snippet}&rdquo;
      </p>
    );
  }
  if (!wasExtracted) {
    return <p className="mt-1 text-xs font-medium text-amber-600">Not found</p>;
  }
  return null;
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";
const highlightClass =
  "w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-navy placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300";

export default function ChangeOrderImportModal({ jobs, defaultJobId, onClose, onCreated }: Props) {
  const sortedJobs = [...jobs].sort((a, b) => {
    const na = parseFloat(a.jobNumber), nb = parseFloat(b.jobNumber);
    return !isNaN(na) && !isNaN(nb) ? na - nb : a.jobNumber.localeCompare(b.jobNumber);
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedCoFields | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [jobReferenceText, setJobReferenceText] = useState("");
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [corNumber, setCorNumber] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [materialsAmount, setMaterialsAmount] = useState("");
  const [laborAmount, setLaborAmount] = useState("");
  const [markupAmount, setMarkupAmount] = useState("");
  const [amount, setAmount] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setIsExtracting(true);
    setExtractError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/change-order/extract", { method: "POST", body });
      const json = await res.json();
      if (json.fallback) {
        setExtractError(json.error ?? "Could not extract change order data.");
        return;
      }
      const fields: ExtractedCoFields = json.fields;
      setDraft(fields);
      setPdfUrl(json.pdfUrl ?? null);

      const materials = fields.materialsAmount?.value ?? null;
      const labor = fields.laborAmount?.value ?? null;
      const markup = fields.markupAmount?.value ?? null;
      const total =
        fields.totalAmount?.value ??
        (materials != null || labor != null || markup != null
          ? (materials ?? 0) + (labor ?? 0) + (markup ?? 0)
          : null);

      setJobReferenceText(asString(fields.jobReference?.value));
      setCorNumber(asString(fields.corNumber?.value));
      setDescription(asString(fields.description?.value));
      setDate(asString(fields.date?.value));
      setMaterialsAmount(asString(materials));
      setLaborAmount(asString(labor));
      setMarkupAmount(asString(markup));
      setAmount(asString(total));
      setJobId(defaultJobId ?? "");
      setSuggestionDismissed(false);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Could not extract change order data.");
    } finally {
      setIsExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function wasExtracted(key: ScalarFieldKey): boolean {
    return draft?.[key]?.value !== null && draft?.[key]?.value !== undefined;
  }

  const suggestedJob =
    draft && !jobId && !suggestionDismissed ? findBestJobMatch(jobReferenceText, jobs)?.job ?? null : null;

  function acceptSuggestedJob() {
    if (suggestedJob) setJobId(suggestedJob.id);
  }

  async function handleConfirm() {
    if (!jobId) {
      setSaveError("Select the job this change order belongs to before confirming.");
      return;
    }
    const parsedAmount = amount.trim() === "" ? 0 : parseFloat(amount.replace(/[^0-9.-]/g, ""));
    if (isNaN(parsedAmount)) {
      setSaveError("Enter a valid amount (or leave it blank).");
      return;
    }

    setSaveError(null);
    setIsSaving(true);
    try {
      const co = await createChangeOrder({
        jobId,
        description: description.trim(),
        amount: parsedAmount,
        pcoNumber: corNumber.trim() || undefined,
        approvalDocUrl: pdfUrl ?? undefined,
        materialsAmount: materialsAmount.trim() !== "" ? Number(materialsAmount) : null,
        laborAmount: laborAmount.trim() !== "" ? Number(laborAmount) : null,
        markupAmount: markupAmount.trim() !== "" ? Number(markupAmount) : null,
        dateSubmitted: date.trim() || null,
      });
      onCreated(co);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create the change order.");
    } finally {
      setIsSaving(false);
    }
  }

  const scalarKeys = Object.keys(FIELD_LABELS) as ScalarFieldKey[];
  const extractedCount = draft ? scalarKeys.filter((k) => wasExtracted(k)).length : 0;
  const missingLabels = draft
    ? scalarKeys.filter((k) => !wasExtracted(k)).map((k) => FIELD_LABELS[k])
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-navy">Import Change Order (AI)</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          {/* ── Upload step ─────────────────────────────────────────────────── */}
          {!draft && (
            <>
              <p className="text-sm text-gray-500">
                Upload a COR export (Clearstory or any other change-order document) — its fields will
                pre-fill the form below for you to review before creating the change order.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isExtracting}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-6 text-sm font-semibold text-teal hover:border-teal hover:bg-teal/5 disabled:opacity-50"
              >
                {isExtracting ? "Reading document…" : "Click to upload a COR PDF"}
              </button>
              {extractError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-800">Extraction failed</p>
                  <p className="mt-1 text-sm text-red-700">{extractError}</p>
                </div>
              )}
            </>
          )}

          {/* ── Review step ─────────────────────────────────────────────────── */}
          {draft && (
            <>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">
                  {extractedCount} of {scalarKeys.length} fields filled from document.
                  {missingLabels.length > 0 && <> Missing: {missingLabels.join(", ")}.</>}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">Every field is editable. Nothing is created until you confirm.</p>
              </div>

              {/* Job */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Job *</label>
                <select
                  value={jobId}
                  onChange={(e) => {
                    setJobId(e.target.value);
                    setSuggestionDismissed(true);
                  }}
                  className={jobId ? inputClass : highlightClass}
                >
                  <option value="">— Select a job —</option>
                  {sortedJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.jobName || `⚠ No name (${j.jobNumber})`}
                      {j.jobName ? ` (${j.jobNumber})` : ""}
                    </option>
                  ))}
                </select>
                {jobReferenceText && (
                  <p className="mt-1 truncate text-xs text-teal" title={jobReferenceText}>
                    Document says: &ldquo;{jobReferenceText}&rdquo;
                  </p>
                )}

                {suggestedJob && (
                  <div className="mt-2 rounded-lg border border-teal/30 bg-teal/5 p-3">
                    <p className="text-sm text-navy">
                      Is this the same job:{" "}
                      <span className="font-semibold">
                        {suggestedJob.jobName || suggestedJob.jobNumber} ({suggestedJob.jobNumber})
                      </span>
                      ?
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={acceptSuggestedJob}
                        className="text-sm font-semibold text-teal hover:underline"
                      >
                        Yes, use this job
                      </button>
                      <button
                        type="button"
                        onClick={() => setSuggestionDismissed(true)}
                        className="text-sm font-semibold text-gray-500 hover:underline"
                      >
                        No — pick manually
                      </button>
                    </div>
                  </div>
                )}
                {!jobId && !suggestedJob && jobReferenceText && (
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    No matching job found — select one manually.
                  </p>
                )}
              </div>

              {/* COR number */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">COR number</label>
                <input
                  type="text"
                  value={corNumber}
                  onChange={(e) => setCorNumber(e.target.value)}
                  placeholder="e.g. COR-014"
                  className={wasExtracted("corNumber") ? inputClass : highlightClass}
                />
                <FieldHint snippet={draft.corNumber?.snippet ?? null} wasExtracted={wasExtracted("corNumber")} />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What does this change order cover?"
                  className={`resize-none ${wasExtracted("description") ? inputClass : highlightClass}`}
                />
                <FieldHint snippet={draft.description?.snippet ?? null} wasExtracted={wasExtracted("description")} />
              </div>

              {/* Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">COR date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={wasExtracted("date") ? inputClass : highlightClass}
                />
                <FieldHint snippet={draft.date?.snippet ?? null} wasExtracted={wasExtracted("date")} />
              </div>

              {/* Cost breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Materials</label>
                  <input
                    type="number"
                    step="0.01"
                    value={materialsAmount}
                    onChange={(e) => setMaterialsAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={wasExtracted("materialsAmount") ? inputClass : highlightClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Labor</label>
                  <input
                    type="number"
                    step="0.01"
                    value={laborAmount}
                    onChange={(e) => setLaborAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={wasExtracted("laborAmount") ? inputClass : highlightClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Markup/OH</label>
                  <input
                    type="number"
                    step="0.01"
                    value={markupAmount}
                    onChange={(e) => setMarkupAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={wasExtracted("markupAmount") ? inputClass : highlightClass}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Breakdown is optional reference detail — only the total Amount below is used for billing.
              </p>

              {/* Amount */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Amount <span className="text-gray-400 font-normal">(negative for deducts)</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="$0.00"
                  className={wasExtracted("totalAmount") ? inputClass : highlightClass}
                />
                {draft.totalAmount?.value == null &&
                  (materialsAmount || laborAmount || markupAmount) && (
                    <p className="mt-1 text-xs text-amber-600">
                      No total was stated in the document — this is materials + labor + markup added up. Confirm it&apos;s correct.
                    </p>
                  )}
                <FieldHint snippet={draft.totalAmount?.snippet ?? null} wasExtracted={wasExtracted("totalAmount")} />
              </div>

              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:underline">
                  📎 View uploaded COR
                </a>
              )}

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSaving}
                  className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {isSaving ? "Creating…" : "Confirm and create CO"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
