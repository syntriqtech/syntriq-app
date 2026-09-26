"use client";

import { useRef, useState } from "react";
import { DbJob } from "@/lib/jobs";
import { createChangeOrder, ChangeOrder } from "@/lib/changeOrdersDb";
import { findBestJobMatch } from "@/lib/jobFuzzyMatch";
import type { CoEntryFields } from "@/app/api/change-order/extract/route";

type Props = {
  jobs: DbJob[];
  defaultJobId?: string;
  onClose: () => void;
  onCreated: (cos: ChangeOrder[]) => void;
};

type EntryFieldKey = keyof CoEntryFields;

const FIELD_LABELS: Record<EntryFieldKey, string> = {
  corNumber: "COR number",
  description: "Description",
  date: "Date",
  materialsAmount: "Materials/equipment amount",
  laborAmount: "Labor amount",
  markupAmount: "Markup/overhead amount",
  totalAmount: "Total amount",
};

type Row = {
  corNumber: string;
  description: string;
  date: string;
  materialsAmount: string;
  laborAmount: string;
  markupAmount: string;
  amount: string;
  include: boolean;
  extracted: CoEntryFields;
};

function asString(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function rowFromEntry(entry: CoEntryFields): Row {
  const materials = entry.materialsAmount?.value ?? null;
  const labor = entry.laborAmount?.value ?? null;
  const markup = entry.markupAmount?.value ?? null;
  const total =
    entry.totalAmount?.value ??
    (materials != null || labor != null || markup != null
      ? (materials ?? 0) + (labor ?? 0) + (markup ?? 0)
      : null);
  return {
    corNumber: asString(entry.corNumber?.value),
    description: asString(entry.description?.value),
    date: asString(entry.date?.value),
    materialsAmount: asString(materials),
    laborAmount: asString(labor),
    markupAmount: asString(markup),
    amount: asString(total),
    include: true,
    extracted: entry,
  };
}

function wasExtracted(entry: CoEntryFields, key: EntryFieldKey): boolean {
  return entry[key]?.value !== null && entry[key]?.value !== undefined;
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
  const [isDragActive, setIsDragActive] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [jobReferenceText, setJobReferenceText] = useState("");
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const [jobId, setJobId] = useState(defaultJobId ?? "");

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
      const entries: CoEntryFields[] = json.fields?.changeOrders ?? [];
      setRows(entries.map(rowFromEntry));
      setPdfUrl(json.pdfUrl ?? null);
      setJobReferenceText(asString(json.fields?.jobReference?.value ?? null));
      setJobId(defaultJobId ?? "");
      setSuggestionDismissed(false);
      setSaveError(null);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Could not extract change order data.");
    } finally {
      setIsExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev));
  }

  const suggestedJob =
    rows && !jobId && !suggestionDismissed ? findBestJobMatch(jobReferenceText, jobs)?.job ?? null : null;

  function acceptSuggestedJob() {
    if (suggestedJob) setJobId(suggestedJob.id);
  }

  async function handleConfirm() {
    if (!rows) return;
    if (!jobId) {
      setSaveError("Select the job these change order(s) belong to before confirming.");
      return;
    }
    const targets = rows.length === 1 ? rows : rows.filter((r) => r.include);
    if (targets.length === 0) {
      setSaveError("Select at least one change order to import.");
      return;
    }

    const parsed: { row: Row; amount: number }[] = [];
    for (const row of targets) {
      const trimmed = row.amount.trim();
      const amount = trimmed === "" ? 0 : parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
      if (isNaN(amount)) {
        setSaveError(`Enter a valid amount for ${row.corNumber || row.description || "one of the change orders"} (or leave it blank).`);
        return;
      }
      parsed.push({ row, amount });
    }

    setSaveError(null);
    setIsSaving(true);
    const created: ChangeOrder[] = [];
    const remaining: Row[] = [];
    const failures: string[] = [];
    for (const { row, amount } of parsed) {
      try {
        const co = await createChangeOrder({
          jobId,
          description: row.description.trim(),
          amount,
          pcoNumber: row.corNumber.trim() || undefined,
          approvalDocUrl: pdfUrl ?? undefined,
          materialsAmount: row.materialsAmount.trim() !== "" ? Number(row.materialsAmount) : null,
          laborAmount: row.laborAmount.trim() !== "" ? Number(row.laborAmount) : null,
          markupAmount: row.markupAmount.trim() !== "" ? Number(row.markupAmount) : null,
          dateSubmitted: row.date.trim() || null,
        });
        created.push(co);
      } catch (err) {
        remaining.push(row);
        failures.push(`${row.corNumber || row.description || "one row"}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setIsSaving(false);

    if (created.length > 0) onCreated(created);

    if (failures.length > 0) {
      setRows(remaining);
      setSaveError(
        `Created ${created.length} of ${parsed.length} change order${parsed.length === 1 ? "" : "s"}. ` +
          `Fix and retry: ${failures.join("; ")}`
      );
    } else {
      onClose();
    }
  }

  const isMultiRow = (rows?.length ?? 0) > 1;
  const includedCount = rows ? (isMultiRow ? rows.filter((r) => r.include).length : rows.length) : 0;
  const includedTotal = rows
    ? rows
        .filter((r) => (isMultiRow ? r.include : true))
        .reduce((sum, r) => sum + (parseFloat(r.amount.replace(/[^0-9.-]/g, "")) || 0), 0)
    : 0;
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const scalarKeys = Object.keys(FIELD_LABELS) as EntryFieldKey[];
  const singleEntry = rows && rows.length === 1 ? rows[0] : null;
  const singleExtractedCount = singleEntry ? scalarKeys.filter((k) => wasExtracted(singleEntry.extracted, k)).length : 0;
  const singleMissingLabels = singleEntry
    ? scalarKeys.filter((k) => !wasExtracted(singleEntry.extracted, k)).map((k) => FIELD_LABELS[k])
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
          {!rows && (
            <>
              <p className="text-sm text-gray-500">
                Upload a COR — a single change-order request, or a COR log/register listing several
                of them — as a PDF or photo. Its fields will pre-fill a review form below for you to
                check before any change order is created.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <div
                onClick={() => !isExtracting && fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isExtracting) setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (!isExtracting && file) handleFile(file);
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  isExtracting
                    ? "cursor-default border-gray-200"
                    : isDragActive
                    ? "cursor-pointer border-teal bg-teal/5"
                    : "cursor-pointer border-gray-200 hover:border-teal/50 hover:bg-gray-50"
                }`}
              >
                {isExtracting ? (
                  <>
                    <svg
                      className="h-8 w-8 animate-spin text-teal"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <p className="text-sm font-semibold text-navy">Reading document…</p>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-8 w-8 text-teal"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 16V4m0 0L7 9m5-5l5 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M20 16v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="text-sm font-semibold text-navy">Drag & drop your file here</p>
                    <p className="text-sm text-gray-500">
                      or <span className="font-semibold text-teal">browse</span> to choose a file
                    </p>
                    <p className="text-xs text-gray-400">.pdf, .jpg, or .png</p>
                  </>
                )}
              </div>
              {extractError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-800">Extraction failed</p>
                  <p className="mt-1 text-sm text-red-700">{extractError}</p>
                </div>
              )}
            </>
          )}

          {/* ── Empty result ────────────────────────────────────────────────── */}
          {rows && rows.length === 0 && (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">No change orders found</p>
                <p className="mt-1 text-sm text-amber-700">
                  Nothing that looked like a change order request was recognized in this document. Try a
                  different file, or use Quick Add instead.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRows(null)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Try another file
              </button>
            </>
          )}

          {/* ── Job select (shared across all rows) ────────────────────────── */}
          {rows && rows.length > 0 && (
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
          )}

          {/* ── Single-CO review ────────────────────────────────────────────── */}
          {singleEntry && (
            <>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">
                  {singleExtractedCount} of {scalarKeys.length} fields filled from document.
                  {singleMissingLabels.length > 0 && <> Missing: {singleMissingLabels.join(", ")}.</>}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">Every field is editable. Nothing is created until you confirm.</p>
              </div>

              {/* COR number */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">COR number</label>
                <input
                  type="text"
                  value={singleEntry.corNumber}
                  onChange={(e) => updateRow(0, { corNumber: e.target.value })}
                  placeholder="e.g. COR-014"
                  className={wasExtracted(singleEntry.extracted, "corNumber") ? inputClass : highlightClass}
                />
                <FieldHint
                  snippet={singleEntry.extracted.corNumber?.snippet ?? null}
                  wasExtracted={wasExtracted(singleEntry.extracted, "corNumber")}
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={singleEntry.description}
                  onChange={(e) => updateRow(0, { description: e.target.value })}
                  rows={3}
                  placeholder="What does this change order cover?"
                  className={`resize-none ${wasExtracted(singleEntry.extracted, "description") ? inputClass : highlightClass}`}
                />
                <FieldHint
                  snippet={singleEntry.extracted.description?.snippet ?? null}
                  wasExtracted={wasExtracted(singleEntry.extracted, "description")}
                />
              </div>

              {/* Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">COR date</label>
                <input
                  type="date"
                  value={singleEntry.date}
                  onChange={(e) => updateRow(0, { date: e.target.value })}
                  className={wasExtracted(singleEntry.extracted, "date") ? inputClass : highlightClass}
                />
                <FieldHint
                  snippet={singleEntry.extracted.date?.snippet ?? null}
                  wasExtracted={wasExtracted(singleEntry.extracted, "date")}
                />
              </div>

              {/* Cost breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Materials</label>
                  <input
                    type="number"
                    step="0.01"
                    value={singleEntry.materialsAmount}
                    onChange={(e) => updateRow(0, { materialsAmount: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={wasExtracted(singleEntry.extracted, "materialsAmount") ? inputClass : highlightClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Labor</label>
                  <input
                    type="number"
                    step="0.01"
                    value={singleEntry.laborAmount}
                    onChange={(e) => updateRow(0, { laborAmount: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={wasExtracted(singleEntry.extracted, "laborAmount") ? inputClass : highlightClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Markup/OH</label>
                  <input
                    type="number"
                    step="0.01"
                    value={singleEntry.markupAmount}
                    onChange={(e) => updateRow(0, { markupAmount: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={wasExtracted(singleEntry.extracted, "markupAmount") ? inputClass : highlightClass}
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
                  value={singleEntry.amount}
                  onChange={(e) => updateRow(0, { amount: e.target.value })}
                  placeholder="$0.00"
                  className={wasExtracted(singleEntry.extracted, "totalAmount") ? inputClass : highlightClass}
                />
                {singleEntry.extracted.totalAmount?.value == null &&
                  (singleEntry.materialsAmount || singleEntry.laborAmount || singleEntry.markupAmount) && (
                    <p className="mt-1 text-xs text-amber-600">
                      No total was stated in the document — this is materials + labor + markup added up. Confirm it&apos;s correct.
                    </p>
                  )}
                <FieldHint
                  snippet={singleEntry.extracted.totalAmount?.snippet ?? null}
                  wasExtracted={wasExtracted(singleEntry.extracted, "totalAmount")}
                />
              </div>
            </>
          )}

          {/* ── Multi-row (COR log) review ──────────────────────────────────── */}
          {isMultiRow && rows && (
            <>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">
                  Found {rows.length} change orders in this document. {includedCount} selected, totaling{" "}
                  {currency.format(includedTotal)}.
                </p>
                <p className="mt-0.5 text-xs text-gray-400">Every field is editable. Nothing is created until you confirm.</p>
              </div>

              <div className="flex flex-col gap-3">
                {rows.map((row, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(i, { include: e.target.checked })}
                        className="mt-1.5 h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={row.corNumber}
                            onChange={(e) => updateRow(i, { corNumber: e.target.value })}
                            placeholder="COR #"
                            className={`w-24 ${wasExtracted(row.extracted, "corNumber") ? inputClass : highlightClass}`}
                          />
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => updateRow(i, { date: e.target.value })}
                            className={wasExtracted(row.extracted, "date") ? inputClass : highlightClass}
                          />
                        </div>
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateRow(i, { description: e.target.value })}
                          placeholder="Description"
                          className={wasExtracted(row.extracted, "description") ? inputClass : highlightClass}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) => updateRow(i, { amount: e.target.value })}
                          placeholder="$0.00"
                          className={`max-w-[140px] ${wasExtracted(row.extracted, "totalAmount") ? inputClass : highlightClass}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {rows && rows.length > 0 && (
            <>
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:underline">
                  📎 View uploaded document
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
                  {isSaving
                    ? "Creating…"
                    : `Confirm and create ${includedCount || 1} CO${includedCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
