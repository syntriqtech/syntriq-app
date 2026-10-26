"use client";

import { useMemo, useRef, useState } from "react";
import Button from "@/components/Button";
import {
  addDocument,
  getStoredMaterialFileUrl,
  JobStoredMaterials,
  removeDocument,
  saveEntry,
  updateCoiExpiration,
  validateStoredMaterialFile,
} from "@/lib/storedMaterialsDb";
import { coiStatusWarning, StoredDocType, StoredMaterialDocument } from "@/lib/storedMaterialsMath";

type PendingFiles = Record<Exclude<StoredDocType, "coi">, File[]>;
const emptyPending = (): PendingFiles => ({ photo: [], bill_of_sale: [], invoice: [], storage_proof: [] });

const ACCEPT = "application/pdf,image/jpeg,image/png";

const DOC_ROWS: { type: Exclude<StoredDocType, "coi">; label: string; hint: string; required: boolean }[] = [
  { type: "photo", label: "Photos of material", hint: "PDF, JPG or PNG", required: true },
  { type: "bill_of_sale", label: "Bill of sale", hint: "PDF, JPG or PNG", required: true },
  { type: "invoice", label: "Supporting invoices", hint: "PDF, JPG or PNG", required: true },
  { type: "storage_proof", label: "Storage location proof (if stored off-site)", hint: "PDF, JPG or PNG", required: false },
];

async function openFile(path: string) {
  try {
    window.open(await getStoredMaterialFileUrl(path), "_blank", "noopener");
  } catch {
    /* the button simply does nothing if the link can't be created */
  }
}

// ── Drop zone ───────────────────────────────────────────────────────────────

function DropZone({
  label,
  hint,
  type,
  saved,
  pending,
  readOnly,
  required,
  onAdd,
  onRemoveSaved,
  onRemovePending,
}: {
  label: string;
  hint: string;
  type: StoredDocType;
  saved: StoredMaterialDocument[];
  pending: File[];
  readOnly: boolean;
  required: boolean;
  onAdd: (files: File[], replacing?: StoredMaterialDocument) => void;
  onRemoveSaved: (doc: StoredMaterialDocument) => void;
  onRemovePending: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<StoredMaterialDocument | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const complete = saved.length + pending.length > 0;

  return (
    <div
      className={`rounded-xl border p-3 ${
        complete
          ? "border-emerald-200 bg-emerald-50/60"
          : required
            ? "border-dashed border-amber-300 bg-amber-50/60"
            : "border-dashed border-gray-200 bg-gray-50"
      } ${dragOver ? "ring-2 ring-teal/40" : ""}`}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(false);
        onAdd(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-navy">
          <span className={complete ? "text-emerald-600" : required ? "text-amber-600" : "text-gray-400"}>{complete ? "✓" : required ? "!" : "○"}</span> {label}
        </p>
        {!readOnly && (
          <div className="flex items-center gap-3">
            {type === "photo" && (
              <button type="button" onClick={() => cameraRef.current?.click()} className="text-xs font-medium text-teal hover:underline sm:hidden">
                Take photo
              </button>
            )}
            <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-medium text-teal hover:underline">
              {complete ? "Add more" : "Choose files"}
            </button>
          </div>
        )}
      </div>

      {!complete && <p className="mt-1 text-xs text-gray-500">{readOnly ? "None added." : `Drag files here or choose files · ${hint}`}</p>}

      <ul className="mt-2 flex flex-col gap-1">
        {saved.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-2 text-xs text-navy">
            <span className="truncate">{doc.fileName}</span>
            <span className="flex shrink-0 gap-3">
              <button type="button" onClick={() => openFile(doc.filePath)} className="font-medium text-teal hover:underline">
                View
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    replacing.current = doc;
                    replaceRef.current?.click();
                  }}
                  className="font-medium text-teal hover:underline"
                >
                  Replace
                </button>
              )}
            </span>
          </li>
        ))}
        {pending.map((file, i) => (
          <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-navy">
            <span className="truncate">{file.name} <span className="text-gray-400">(will upload on save)</span></span>
            <button type="button" onClick={() => onRemovePending(file)} className="shrink-0 text-gray-400 hover:text-red-500">
              ✕
            </button>
          </li>
        ))}
      </ul>

      <input ref={inputRef} type="file" hidden multiple accept={ACCEPT} onChange={(e) => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <input
        ref={replaceRef}
        type="file"
        hidden
        accept={ACCEPT}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (replacing.current && picked.length > 0) {
            onRemoveSaved(replacing.current);
            onAdd(picked.slice(0, 1));
          }
          replacing.current = undefined;
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export default function StoredMaterialsPanel({
  jobId,
  payApplicationId,
  applicationNumber,
  periodTo,
  line,
  data,
  readOnly,
  initialErrors,
  onClose,
  onSaved,
}: {
  jobId: string;
  payApplicationId: string;
  applicationNumber: string;
  periodTo: string;
  /** `amount` is the line's current Stored Materials figure — recorded for reference only, never changed here. */
  line: { item: string; kind: "line" | "change_order"; description: string; amount: number };
  data: JobStoredMaterials;
  readOnly: boolean;
  initialErrors?: string[];
  onClose: () => void;
  /** Called after every save attempt with any problems; the parent reloads the data and closes the panel when there are none. */
  onSaved: (problems: string[]) => Promise<void>;
}) {
  // This line's records for this application (normally one; the panel just groups their files).
  const lineEntries = useMemo(
    () =>
      data.entries.filter(
        (e) => e.sovItem === line.item && e.sovKind === line.kind && e.applicationNumber === applicationNumber && !e.originEntryId
      ),
    [data.entries, line.item, line.kind, applicationNumber]
  );
  const savedDocs = useMemo(
    () => data.documents.filter((d) => lineEntries.some((e) => e.id === d.entryId)),
    [data.documents, lineEntries]
  );

  const [pending, setPending] = useState<PendingFiles>(emptyPending);
  const [removedDocs, setRemovedDocs] = useState<StoredMaterialDocument[]>([]);

  const existingCoi = data.coi;
  const [coiFile, setCoiFile] = useState<File | null>(null);
  const [coiExpiration, setCoiExpiration] = useState(existingCoi?.coiExpirationDate ?? "");
  const coiInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>(initialErrors ?? []);

  const liveSaved = (type: StoredDocType) => savedDocs.filter((d) => d.docType === type && !removedDocs.includes(d));

  function addFiles(type: Exclude<StoredDocType, "coi">, files: File[]) {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      const problem = validateStoredMaterialFile(f);
      if (problem) problems.push(problem);
      else accepted.push(f);
    }
    setErrors(problems);
    if (accepted.length > 0) setPending((prev) => ({ ...prev, [type]: [...prev[type], ...accepted] }));
  }

  // Requirement progress: photos, bill of sale, invoices, plus the job's COI.
  const requirements = useMemo(() => {
    const required = DOC_ROWS.filter((r) => r.required).map((r) => r.type);
    const done =
      required.filter((t) => savedDocs.some((d) => d.docType === t && !removedDocs.includes(d)) || pending[t].length > 0).length +
      (existingCoi || coiFile ? 1 : 0);
    return { done, total: required.length + 1 };
  }, [savedDocs, removedDocs, pending, existingCoi, coiFile]);

  const effectiveCoi: StoredMaterialDocument | null = existingCoi
    ? { ...existingCoi, coiExpirationDate: coiExpiration || null }
    : coiFile
      ? ({ coiExpirationDate: coiExpiration || null } as StoredMaterialDocument)
      : null;
  const coiWarning = coiStatusWarning(effectiveCoi, periodTo);

  // ── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setIsSaving(true);
    setErrors([]);
    const problems: string[] = [];
    const ctx = { jobId, payApplicationId, applicationNumber };
    try {
      const hasNewFiles = Object.values(pending).some((files) => files.length > 0);
      let entryId = lineEntries[0]?.id;
      // The files hang off one record per line. It's created automatically — the user never fills it in.
      if (!entryId && hasNewFiles) {
        const created = await saveEntry({
          ...ctx,
          sovItem: line.item,
          sovKind: line.kind,
          originEntryId: null,
          vendor: "",
          description: line.description,
          amount: line.amount,
          storageLocation: "onsite",
          installedThisPeriod: 0,
          notes: "",
        });
        entryId = created.id;
      }

      for (const doc of removedDocs) await removeDocument(doc, applicationNumber);
      if (entryId) {
        for (const type of Object.keys(pending) as Exclude<StoredDocType, "coi">[]) {
          for (const file of pending[type]) {
            try {
              await addDocument({ ...ctx, file, docType: type, entryId });
            } catch (err) {
              problems.push(err instanceof Error ? err.message : `${file.name} could not be uploaded`);
            }
          }
        }
      }

      if (coiFile) {
        try {
          if (existingCoi) await removeDocument(existingCoi, applicationNumber);
          await addDocument({ ...ctx, file: coiFile, docType: "coi", entryId: null, coiExpirationDate: coiExpiration || null });
        } catch (err) {
          problems.push(err instanceof Error ? err.message : "The COI could not be uploaded");
        }
      } else if (existingCoi && (existingCoi.coiExpirationDate ?? "") !== coiExpiration) {
        await updateCoiExpiration(existingCoi.id, coiExpiration || null);
      }

      await onSaved(problems);
    } catch (err) {
      // Something may already be saved — let the parent reload so a retry doesn't duplicate files.
      const message = err instanceof Error ? err.message : "Could not save stored materials.";
      try {
        await onSaved([message]);
      } catch {
        setErrors([message]);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={isSaving ? undefined : onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-navy">Stored materials · {line.description || `Item ${line.item}`}</h2>
            <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close" className="text-xl leading-none text-gray-400 hover:text-gray-600">
              ×
            </button>
          </div>
          <div className="mt-3">
            <p className="text-xs text-gray-500">
              {requirements.done} of {requirements.total} requirements complete
            </p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(requirements.done / requirements.total) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          {readOnly && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">This application is locked, so files can&apos;t be changed.</p>
          )}

          <section className="flex flex-col gap-2">
            {DOC_ROWS.map((row) => (
              <DropZone
                key={row.type}
                label={row.label}
                hint={row.hint}
                type={row.type}
                required={row.required}
                readOnly={readOnly}
                saved={liveSaved(row.type)}
                pending={pending[row.type]}
                onAdd={(files) => addFiles(row.type, files)}
                onRemoveSaved={(doc) => setRemovedDocs((prev) => [...prev, doc])}
                onRemovePending={(file) => setPending((prev) => ({ ...prev, [row.type]: prev[row.type].filter((f) => f !== file) }))}
              />
            ))}
          </section>

          {/* Job-level COI */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-gray-500">Certificate of insurance (once per job)</h3>
            <div className={`rounded-xl border p-3 ${existingCoi || coiFile ? "border-emerald-200 bg-emerald-50/60" : "border-dashed border-amber-300 bg-amber-50/60"}`}>
              {existingCoi && !coiFile && (
                <p className="text-xs text-navy">
                  <span className="font-medium">{existingCoi.fileName}</span> · Expires{" "}
                  {existingCoi.coiExpirationDate ? new Date(existingCoi.coiExpirationDate + "T00:00:00").toLocaleDateString("en-US") : "—"}
                  {existingCoi.applicationNumber ? ` · reused from Pay app #${existingCoi.applicationNumber}` : ""}{" "}
                  <button type="button" onClick={() => openFile(existingCoi.filePath)} className="ml-1 font-medium text-teal hover:underline">View</button>
                </p>
              )}
              {coiFile && <p className="text-xs text-navy">{coiFile.name} <span className="text-gray-400">(will upload on save)</span></p>}
              {!existingCoi && !coiFile && <p className="text-xs text-gray-500">No COI on file for this job yet.</p>}
              {!readOnly && (
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="max-w-[180px]">
                    <label htmlFor="coiExpiration" className="text-xs font-medium text-navy">Expiration date</label>
                    <input
                      id="coiExpiration"
                      type="date"
                      value={coiExpiration}
                      onChange={(e) => setCoiExpiration(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                    />
                  </div>
                  <button type="button" onClick={() => coiInputRef.current?.click()} className="pb-2 text-xs font-semibold text-teal hover:underline">
                    {existingCoi || coiFile ? "Replace" : "Choose file"}
                  </button>
                  <input
                    ref={coiInputRef}
                    type="file"
                    hidden
                    accept={ACCEPT}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      const problem = validateStoredMaterialFile(f);
                      if (problem) setErrors([problem]);
                      else {
                        setErrors([]);
                        setCoiFile(f);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            {coiWarning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{coiWarning}. You can still save and download.</p>}
          </section>

          {errors.length > 0 && (
            <ul className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4">
          <Button type="button" onClick={handleSave} disabled={readOnly || isSaving}>
            {isSaving ? "Saving…" : "Save stored materials"}
          </Button>
          <p className="mt-2 text-xs text-gray-500">Missing items won&apos;t block the package. They&apos;ll show as warnings.</p>
        </div>
      </div>
    </div>
  );
}
