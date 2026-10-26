// Pure helpers for Stored Materials — no database or UI in here.
//
// These never touch payAppMath.ts. The only number that reaches the G702/G703
// is the SOV line's Stored Materials cell, which the user types as always;
// stored materials just attaches the supporting files.

export type StorageLocation = "onsite" | "offsite";
export type StoredDocType = "photo" | "bill_of_sale" | "invoice" | "coi" | "storage_proof";

export type StoredMaterialEntry = {
  id: string;
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

export type StoredMaterialDocument = {
  id: string;
  entryId: string | null;
  jobId: string;
  payApplicationId: string;
  docType: StoredDocType;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  coiExpirationDate: string | null;
  createdAt: string;
  /** For a COI: the application number it was first uploaded on. */
  applicationNumber?: string;
};

export function compareAppNumbers(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

export type StoredMaterialsWarning = { key: string; message: string };

/** Sections the downloaded package can contain, in the default order. */
export type PackageSectionKey = "coi" | "bill_of_sale" | "invoice" | "photo" | "storage_proof";
export const DEFAULT_SECTION_ORDER: PackageSectionKey[] = ["coi", "bill_of_sale", "invoice", "photo", "storage_proof"];
export const SECTION_LABELS: Record<PackageSectionKey, string> = {
  coi: "Certificate of insurance",
  bill_of_sale: "Bill of sale",
  invoice: "Supporting invoices",
  photo: "Photos of material",
  storage_proof: "Storage location proof",
};

/** Missing-document warnings for a set of entries (used by the panel and the download page). */
export function missingDocumentWarnings(
  entries: { entry: StoredMaterialEntry; docs: StoredMaterialDocument[] }[],
  coi: StoredMaterialDocument | null,
  periodEnd: string
): StoredMaterialsWarning[] {
  const warnings: StoredMaterialsWarning[] = [];
  const label = (e: StoredMaterialEntry) => e.description.trim() || e.vendor.trim() || `Item ${e.sovItem}`;
  const has = (docs: StoredMaterialDocument[], t: StoredDocType) => docs.some((d) => d.docType === t);

  for (const { entry, docs } of entries) {
    if (!has(docs, "photo")) warnings.push({ key: `photo-${entry.id}`, message: `No photos for ${label(entry)}` });
    if (!has(docs, "bill_of_sale")) warnings.push({ key: `bos-${entry.id}`, message: `No bill of sale for ${label(entry)}` });
    if (!has(docs, "invoice")) warnings.push({ key: `inv-${entry.id}`, message: `No supporting invoice for ${label(entry)}` });
    if (entry.storageLocation === "offsite" && !has(docs, "storage_proof")) {
      warnings.push({ key: `proof-${entry.id}`, message: `Off-site storage proof missing for ${label(entry)}` });
    }
  }

  if (entries.length > 0) {
    const coiWarning = coiStatusWarning(coi, periodEnd);
    if (coiWarning) warnings.push({ key: "coi", message: coiWarning });
  }
  return warnings;
}

export function coiStatusWarning(coi: StoredMaterialDocument | null, periodEnd: string): string | null {
  if (!coi) return "Certificate of insurance (COI) missing";
  if (!coi.coiExpirationDate) return "COI has no expiration date on file";
  const today = new Date().toISOString().slice(0, 10);
  if (coi.coiExpirationDate < today) return "COI is expired";
  if (periodEnd && coi.coiExpirationDate < periodEnd) return "COI expires before this application's period end date";
  return null;
}
