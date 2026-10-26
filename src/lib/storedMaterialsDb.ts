import { createClient } from "@/lib/supabase/client";
import { getCurrentUserContext } from "@/lib/currentUserContext";
import { logActivity } from "@/lib/activityLogDb";
import type {
  StorageLocation,
  StoredDocType,
  StoredMaterialDocument,
  StoredMaterialEntry,
} from "@/lib/storedMaterialsMath";

const BUCKET = "stored-materials";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

type EntryRow = {
  id: string;
  pay_application_id: string;
  job_id: string;
  application_number: string;
  sov_item: string;
  sov_kind: "line" | "change_order";
  origin_entry_id: string | null;
  vendor: string;
  description: string;
  amount: number;
  storage_location: StorageLocation;
  installed_this_period: number;
  notes: string | null;
};

type DocumentRow = {
  id: string;
  entry_id: string | null;
  job_id: string;
  pay_application_id: string;
  doc_type: StoredDocType;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  coi_expiration_date: string | null;
  created_at: string;
  pay_applications?: { application_number: string } | null;
};

function rowToEntry(row: EntryRow): StoredMaterialEntry {
  return {
    id: row.id,
    payApplicationId: row.pay_application_id,
    jobId: row.job_id,
    applicationNumber: row.application_number,
    sovItem: row.sov_item,
    sovKind: row.sov_kind,
    originEntryId: row.origin_entry_id,
    vendor: row.vendor,
    description: row.description,
    amount: Number(row.amount),
    storageLocation: row.storage_location,
    installedThisPeriod: Number(row.installed_this_period),
    notes: row.notes ?? "",
  };
}

function rowToDocument(row: DocumentRow): StoredMaterialDocument {
  return {
    id: row.id,
    entryId: row.entry_id,
    jobId: row.job_id,
    payApplicationId: row.pay_application_id,
    docType: row.doc_type,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    coiExpirationDate: row.coi_expiration_date,
    createdAt: row.created_at,
    applicationNumber: row.pay_applications?.application_number,
  };
}

// ── Files ─────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function isHeic(file: File) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/** Returns a plain-English problem with the file, or null if it's fine. Every document type accepts PDF, JPG and PNG. Size is checked again after compression. */
export function validateStoredMaterialFile(file: File): string | null {
  // HEIC is rejected rather than converted: browsers can't decode it reliably
  // and there is no converter library in the project.
  if (isHeic(file)) return `${file.name}: Convert this photo to JPG or PNG.`;
  if (!ALLOWED_TYPES.includes(file.type)) return `${file.name}: only PDF, JPG, and PNG files are allowed.`;
  return null;
}

/** Shrinks big photos in the browser (max 2400px, JPEG) so uploads stay well under the 10 MB limit. */
export async function prepareStoredMaterialFile(file: File): Promise<File> {
  let result = file;
  if (file.type.startsWith("image/") && file.size > 1_000_000) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff"; // PNG transparency becomes white instead of black
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
        if (blob && blob.size < file.size) {
          result = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        }
      }
    } catch {
      // Couldn't decode it — fall through and upload the original.
    }
  }
  if (result.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than 10 MB. Please use a smaller file.`);
  }
  return result;
}

export async function getStoredMaterialFileUrl(path: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message ?? "Could not open this file.");
  return data.signedUrl;
}

export async function downloadStoredMaterialFile(path: string): Promise<Blob> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "Could not download a stored-materials file.");
  return data;
}

async function uploadFile(jobId: string, file: File): Promise<string> {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${organizationId ?? userId}/${jobId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

// ── Reads ─────────────────────────────────────────────────────────────────

export type JobStoredMaterials = {
  /** Entries on each application's current revision (superseded revisions and deleted apps excluded). */
  entries: StoredMaterialEntry[];
  /** Entry-level documents for those entries. */
  documents: StoredMaterialDocument[];
  /** The job's most recent COI, if any. */
  coi: StoredMaterialDocument | null;
};

export async function fetchJobStoredMaterials(jobId: string): Promise<JobStoredMaterials> {
  const supabase = createClient();

  const { data: entryRows, error: entryError } = await supabase
    .from("stored_material_entries")
    .select("*, pay_applications!inner(is_current_revision, deleted_at)")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .eq("pay_applications.is_current_revision", true)
    .is("pay_applications.deleted_at", null);
  if (entryError) throw new Error(entryError.message);
  const entries = (entryRows ?? []).map((r) => rowToEntry(r as EntryRow));

  let documents: StoredMaterialDocument[] = [];
  if (entries.length > 0) {
    const { data: docRows, error: docError } = await supabase
      .from("stored_material_documents")
      .select("*")
      .in("entry_id", entries.map((e) => e.id))
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (docError) throw new Error(docError.message);
    documents = (docRows ?? []).map((r) => rowToDocument(r as DocumentRow));
  }

  const { data: coiRows, error: coiError } = await supabase
    .from("stored_material_documents")
    .select("*, pay_applications(application_number)")
    .eq("job_id", jobId)
    .eq("doc_type", "coi")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (coiError) throw new Error(coiError.message);
  const coi = coiRows && coiRows[0] ? rowToDocument(coiRows[0] as DocumentRow) : null;

  return { entries, documents, coi };
}

// ── Writes ────────────────────────────────────────────────────────────────

export type EntryInput = {
  id?: string;
  payApplicationId: string;
  jobId: string;
  applicationNumber: string;
  sovItem: string;
  sovKind: "line" | "change_order";
  originEntryId: string | null;
  vendor: string;
  description: string;
  amount: number;
  storageLocation: StorageLocation;
  installedThisPeriod: number;
  notes: string;
};

export async function saveEntry(input: EntryInput): Promise<StoredMaterialEntry> {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();
  const fields = {
    vendor: input.vendor.trim(),
    description: input.description.trim(),
    amount: input.amount,
    storage_location: input.storageLocation,
    installed_this_period: input.installedThisPeriod,
    notes: input.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("stored_material_entries")
      .update(fields)
      .eq("id", input.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return rowToEntry(data);
  }

  const { data, error } = await supabase
    .from("stored_material_entries")
    .insert({
      ...fields,
      user_id: userId,
      organization_id: organizationId,
      pay_application_id: input.payApplicationId,
      job_id: input.jobId,
      application_number: input.applicationNumber,
      sov_item: input.sovItem,
      sov_kind: input.sovKind,
      origin_entry_id: input.originEntryId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const saved = rowToEntry(data);
  if (!input.originEntryId) {
    logActivity(
      "stored_materials.entry_added",
      "stored_material_entry",
      saved.id,
      `Application #${input.applicationNumber}, item ${input.sovItem} — ${saved.vendor || "stored materials"} $${saved.amount.toLocaleString()}`
    ).catch(() => {});
  }
  return saved;
}

/** Soft-deletes an entry and its documents. */
export async function removeEntry(entry: StoredMaterialEntry): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { error: docError } = await supabase
    .from("stored_material_documents")
    .update({ deleted_at: now })
    .eq("entry_id", entry.id)
    .is("deleted_at", null);
  if (docError) throw new Error(docError.message);
  const { error } = await supabase.from("stored_material_entries").update({ deleted_at: now }).eq("id", entry.id);
  if (error) throw new Error(error.message);
  logActivity(
    "stored_materials.entry_removed",
    "stored_material_entry",
    entry.id,
    `Application #${entry.applicationNumber}, item ${entry.sovItem} — ${entry.vendor || "stored materials"} $${entry.amount.toLocaleString()}`
  ).catch(() => {});
}

export async function addDocument(args: {
  file: File;
  docType: StoredDocType;
  entryId: string | null;
  jobId: string;
  payApplicationId: string;
  applicationNumber: string;
  coiExpirationDate?: string | null;
}): Promise<StoredMaterialDocument> {
  const supabase = createClient();
  const { userId, organizationId } = await getCurrentUserContext();
  const prepared = await prepareStoredMaterialFile(args.file);
  const filePath = await uploadFile(args.jobId, prepared);

  const { data, error } = await supabase
    .from("stored_material_documents")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      entry_id: args.entryId,
      job_id: args.jobId,
      pay_application_id: args.payApplicationId,
      doc_type: args.docType,
      file_path: filePath,
      file_name: args.file.name,
      mime_type: prepared.type,
      file_size: prepared.size,
      coi_expiration_date: args.docType === "coi" ? args.coiExpirationDate || null : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const saved = rowToDocument(data);
  logActivity(
    "stored_materials.document_added",
    "stored_material_document",
    saved.id,
    `Application #${args.applicationNumber} — ${args.docType.replace(/_/g, " ")}: ${saved.fileName}`
  ).catch(() => {});
  return saved;
}

export async function removeDocument(doc: StoredMaterialDocument, applicationNumber: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stored_material_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  logActivity(
    "stored_materials.document_removed",
    "stored_material_document",
    doc.id,
    `Application #${applicationNumber} — ${doc.docType.replace(/_/g, " ")}: ${doc.fileName}`
  ).catch(() => {});
}

export async function updateCoiExpiration(docId: string, expiration: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stored_material_documents")
    .update({ coi_expiration_date: expiration, updated_at: new Date().toISOString() })
    .eq("id", docId);
  if (error) throw new Error(error.message);
}

// ── Pay application lifecycle hooks ───────────────────────────────────────

/** Called when a pay application is soft-deleted. The job-level COI is left alone — other applications reuse it. */
export async function softDeleteStoredMaterialsForPayApp(payAppId: string): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { error: docError } = await supabase
    .from("stored_material_documents")
    .update({ deleted_at: now })
    .eq("pay_application_id", payAppId)
    .not("entry_id", "is", null)
    .is("deleted_at", null);
  if (docError) throw new Error(docError.message);
  const { error } = await supabase
    .from("stored_material_entries")
    .update({ deleted_at: now })
    .eq("pay_application_id", payAppId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
}

/**
 * Called after a revision is created: copies the old revision's entries and
 * entry documents onto the new revision (files are shared, not re-uploaded).
 * Later applications' carried entries that pointed at an old entry are
 * re-pointed at the copy so installed-to-date totals still add up.
 */
export async function copyStoredMaterialsToRevision(oldPayAppId: string, newPayAppId: string): Promise<void> {
  const supabase = createClient();
  const { data: oldEntries, error } = await supabase
    .from("stored_material_entries")
    .select("*")
    .eq("pay_application_id", oldPayAppId)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not carry stored materials into the revision: ${error.message}`);
  if (!oldEntries || oldEntries.length === 0) return;

  for (const old of oldEntries) {
    const { id: oldId, created_at: _c, updated_at: _u, deleted_at: _d, ...rest } = old;
    void _c; void _u; void _d;
    const { data: copy, error: insertError } = await supabase
      .from("stored_material_entries")
      .insert({ ...rest, pay_application_id: newPayAppId })
      .select("id")
      .single();
    if (insertError) throw new Error(`Could not carry stored materials into the revision: ${insertError.message}`);

    const { error: repointError } = await supabase
      .from("stored_material_entries")
      .update({ origin_entry_id: copy.id })
      .eq("origin_entry_id", oldId);
    if (repointError) throw new Error(repointError.message);

    const { data: oldDocs, error: docsError } = await supabase
      .from("stored_material_documents")
      .select("*")
      .eq("entry_id", oldId)
      .is("deleted_at", null);
    if (docsError) throw new Error(docsError.message);
    if (oldDocs && oldDocs.length > 0) {
      const copies = oldDocs.map((d) => {
        const { id: _id, created_at: _dc, updated_at: _du, deleted_at: _dd, ...docRest } = d;
        void _id; void _dc; void _du; void _dd;
        return { ...docRest, entry_id: copy.id, pay_application_id: newPayAppId };
      });
      const { error: copyDocsError } = await supabase.from("stored_material_documents").insert(copies);
      if (copyDocsError) throw new Error(copyDocsError.message);
    }
  }
}
