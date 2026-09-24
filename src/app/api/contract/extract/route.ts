import { NextRequest, NextResponse } from "next/server";
import { requireProPlan } from "@/lib/requirePlan";
import {
  extractJsonFromPdf,
  validatePdfUpload,
  getAnthropicApiKey,
  EXTRACTABLE_MEDIA_TYPES,
  type ExtractableMediaType,
} from "@/lib/aiPdfExtraction";
import {
  extractJsonFromText,
  validateExcelUpload,
  workbookToText,
  EXCEL_MEDIA_TYPE,
} from "@/lib/aiExcelExtraction";

const FILE_EXTENSIONS: Record<ExtractableMediaType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const BUCKET = "contract-pdfs";

// Same target shape as EXTRACTION_PROMPT below, but describing a filled
// billing workbook (e.g. the same layout Custom Billing Forms fills) rather
// than a subcontract — real workbooks accumulate row edits over time and
// stop matching whatever blank template they started from, so this asks
// Claude to find the right sections by their labels/content rather than
// assuming fixed cell positions.
const EXCEL_EXTRACTION_PROMPT = `You are extracting job setup information from a real, in-use construction billing workbook (an Excel spreadsheet, given below as plain text, one section per sheet).

Return ONLY a valid JSON object — no markdown, no commentary, just the JSON.
For every field include "value" (the extracted data, or null if not found) and "snippet"
(a short direct quote from the sheet text that supports the value, or null).

NEVER guess or fabricate values. If a field is not clearly stated, return null.

{
  "jobName":              { "value": string | null, "snippet": string | null },
  "customer":             { "value": string | null, "snippet": string | null },
  "customerAddress":      { "value": string | null, "snippet": string | null },
  "owner":                { "value": string | null, "snippet": string | null },
  "ownerAddress":         { "value": string | null, "snippet": string | null },
  "jobAddress":           { "value": string | null, "snippet": string | null },
  "architect":            { "value": string | null, "snippet": string | null },
  "architectProjectNumber": { "value": string | null, "snippet": string | null },
  "contractFor":          { "value": string | null, "snippet": string | null },
  "contractValue":        { "value": number | null, "snippet": string | null },
  "contractDate":         { "value": string | null, "snippet": string | null },
  "startDate":            { "value": string | null, "snippet": string | null },
  "retentionRateCW":      { "value": number | null, "snippet": string | null },
  "retentionRateSM":      { "value": number | null, "snippet": string | null },
  "billingDueDay":        { "value": number | null, "snippet": string | null },
  "ctiPm":                { "value": string | null, "snippet": string | null },
  "poNumber":             { "value": string | null, "snippet": string | null },
  "sovLineItems": [
    { "item": string | null, "description": string, "scheduledValue": number }
  ]
}

Field rules:
- customer: the General Contractor (GC) named on the job-information sheet — not the subcontractor filling out this workbook.
- customerAddress / jobAddress: the GC's and the job site's street + city/state/zip, combined into one string each.
- owner: the property owner, if a separate "OWNER" field is given.
- contractValue: the original contract value as a plain number (e.g. 128398, not "$128,398.00").
- contractDate, startDate: these often aren't present in a billing workbook (unlike a signed contract) — return null rather than guessing from an application date.
- retentionRateCW / retentionRateSM: retention percentage for completed work / stored materials, as a plain number (e.g. 10 for 10%). If the sheet gives one retention rate for regular contract work, use it for both.
- ctiPm: the subcontractor's own project manager name (not the GC's contact).
- poNumber: a PO number or job number issued for this job, if present.
- billingDueDay: only if explicitly stated; usually not present in a billing workbook — return null rather than guessing.
- sovLineItems: the Schedule of Values / cost breakdown line items for the CURRENT contract scope (not change orders). If the workbook has more than one similarly-named Schedule of Values sheet, use whichever one actually contains populated, non-zero data — ignore a blank duplicate.
  - Skip section-header rows that have no item number AND no dollar amount (e.g. a row that's just a category label like "Common Area Tile" separating groups of line items below it).
  - Skip subtotal/total/grand-total rows.
  - DO include a real line item even if it has no item number (e.g. a credit or deduct line) — return "item": null for those.
  - "scheduledValue" is that line's Scheduled Value / original contract amount for the line — a plain number (negative for a credit/deduct line). Do NOT use "Previous Applications," "Current Completed," "Total Completed," or any other already-billed column — this workbook may show billing history, but only the Scheduled Value column belongs in this field.`;

// Fields to extract — mirrors the job setup form.
// For each field: value is the extracted data, snippet is a short quote from the doc.
const EXTRACTION_PROMPT = `You are extracting job setup information from a construction subcontract PDF.

Return ONLY a valid JSON object — no markdown, no commentary, just the JSON.
For every field include "value" (the extracted data, or null if not found) and "snippet"
(a short direct quote from the document that supports the value, or null).

NEVER guess or fabricate values. If a field is not clearly stated in the document, return null.

{
  "jobName":              { "value": string | null, "snippet": string | null },
  "customer":             { "value": string | null, "snippet": string | null },
  "customerAddress":      { "value": string | null, "snippet": string | null },
  "owner":                { "value": string | null, "snippet": string | null },
  "ownerAddress":         { "value": string | null, "snippet": string | null },
  "jobAddress":           { "value": string | null, "snippet": string | null },
  "architect":            { "value": string | null, "snippet": string | null },
  "architectProjectNumber": { "value": string | null, "snippet": string | null },
  "contractFor":          { "value": string | null, "snippet": string | null },
  "contractValue":        { "value": number | null, "snippet": string | null },
  "contractDate":         { "value": string | null, "snippet": string | null },
  "startDate":            { "value": string | null, "snippet": string | null },
  "retentionRateCW":      { "value": number | null, "snippet": string | null },
  "retentionRateSM":      { "value": number | null, "snippet": string | null },
  "billingDueDay":        { "value": number | null, "snippet": string | null },
  "ctiPm":                { "value": string | null, "snippet": string | null },
  "poNumber":             { "value": string | null, "snippet": string | null },
  "sovLineItems": [
    { "item": string | null, "description": string, "scheduledValue": number }
  ]
}

Field rules:
- customer: the General Contractor (GC) company — the party contracting this subcontractor
- contractValue: dollar amount as a plain number (e.g. 450000, not "$450,000.00")
- contractDate, startDate: ISO format YYYY-MM-DD
- retentionRateCW: retention % for completed work (e.g. 10 for 10%)
- retentionRateSM: retention % for stored materials; use retentionRateCW value if only one rate stated
- billingDueDay: day of month billing is due (e.g. 25 for "billing due on the 25th of each month")
- ctiPm: the subcontractor's own project manager — may not appear in the contract; return null if absent
- poNumber: a purchase order or GC-issued contract/agreement number identifying this subcontract — not the same as the architect/GC's internal project number
- sovLineItems: an itemized schedule of values / cost breakdown table for the contract scope, if the
  document includes one (a table or list of line items with dollar amounts, e.g. an exhibit attached
  to the subcontract). Return one entry per line item, in document order. "item" is that line's
  item/number label if the document gives one, otherwise null. "scheduledValue" is that line's dollar
  amount as a plain number. If the document states only a single lump-sum contract price with no
  itemized breakdown, return an empty array — do NOT invent a single line item from the total contract
  value, and do NOT include subtotal, tax, or grand-total rows as line items.`;

export type ExtractedFields = {
  jobName:               { value: string | null; snippet: string | null };
  customer:              { value: string | null; snippet: string | null };
  customerAddress:       { value: string | null; snippet: string | null };
  owner:                 { value: string | null; snippet: string | null };
  ownerAddress:          { value: string | null; snippet: string | null };
  jobAddress:            { value: string | null; snippet: string | null };
  architect:             { value: string | null; snippet: string | null };
  architectProjectNumber:{ value: string | null; snippet: string | null };
  contractFor:           { value: string | null; snippet: string | null };
  contractValue:         { value: number | null; snippet: string | null };
  contractDate:          { value: string | null; snippet: string | null };
  startDate:             { value: string | null; snippet: string | null };
  retentionRateCW:       { value: number | null; snippet: string | null };
  retentionRateSM:       { value: number | null; snippet: string | null };
  billingDueDay:         { value: number | null; snippet: string | null };
  ctiPm:                 { value: string | null; snippet: string | null };
  poNumber:              { value: string | null; snippet: string | null };
  sovLineItems:          { item: string | null; description: string; scheduledValue: number }[];
};

export type ExtractResponse =
  | { fields: ExtractedFields; pdfUrl: string }
  | { fallback: true; error: string; pdfUrl?: string };

// Claude occasionally flattens a {value, snippet} field into just its raw
// value (observed live on a real Excel extraction: contractValue,
// retentionRateCW/SM, ctiPm, and poNumber came back as plain numbers/strings
// instead of {value, snippet}) — this recovers the real value either way
// rather than trusting the model to nest every field correctly every time.
function toFieldValue<T>(raw: unknown): { value: T | null; snippet: string | null } {
  if (raw && typeof raw === "object" && "value" in raw) {
    const obj = raw as { value?: T | null; snippet?: string | null };
    return { value: obj.value ?? null, snippet: obj.snippet ?? null };
  }
  if (raw === undefined || raw === null) return { value: null, snippet: null };
  return { value: raw as T, snippet: null };
}

function normalizeExtractedFields(raw: Record<string, unknown> | null | undefined): ExtractedFields {
  const lines = Array.isArray(raw?.sovLineItems) ? raw.sovLineItems : [];
  return {
    jobName: toFieldValue(raw?.jobName),
    customer: toFieldValue(raw?.customer),
    customerAddress: toFieldValue(raw?.customerAddress),
    owner: toFieldValue(raw?.owner),
    ownerAddress: toFieldValue(raw?.ownerAddress),
    jobAddress: toFieldValue(raw?.jobAddress),
    architect: toFieldValue(raw?.architect),
    architectProjectNumber: toFieldValue(raw?.architectProjectNumber),
    contractFor: toFieldValue(raw?.contractFor),
    contractValue: toFieldValue(raw?.contractValue),
    contractDate: toFieldValue(raw?.contractDate),
    startDate: toFieldValue(raw?.startDate),
    retentionRateCW: toFieldValue(raw?.retentionRateCW),
    retentionRateSM: toFieldValue(raw?.retentionRateSM),
    billingDueDay: toFieldValue(raw?.billingDueDay),
    ctiPm: toFieldValue(raw?.ctiPm),
    poNumber: toFieldValue(raw?.poNumber),
    sovLineItems: lines.map((line) => {
      const l = line as { item?: string | null; description?: string; scheduledValue?: number };
      return {
        item: l?.item ?? null,
        description: String(l?.description ?? ""),
        scheduledValue: Number(l?.scheduledValue) || 0,
      };
    }),
  };
}

export async function POST(req: NextRequest) {
  // ── Key check ────────────────────────────────────────────────────────────
  try {
    getAnthropicApiKey();
  } catch (err) {
    return NextResponse.json(
      { fallback: true, error: err instanceof Error ? err.message : "Extraction is not configured." },
      { status: 503 }
    );
  }

  // ── Auth + plan gate ─────────────────────────────────────────────────────
  // Import Contract (AI) is Pro-only.
  const gate = await requireProPlan();
  if (!gate.ok) {
    return NextResponse.json({ fallback: true, error: gate.message }, { status: gate.status });
  }
  const { user, supabase } = gate;

  // ── Parse upload ─────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { fallback: true, error: "Could not read the upload." },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const isExcel = file?.type === EXCEL_MEDIA_TYPE;

  try {
    if (isExcel) validateExcelUpload(file);
    else validatePdfUpload(file, undefined, EXTRACTABLE_MEDIA_TYPES);
  } catch (err) {
    return NextResponse.json(
      { fallback: true, error: err instanceof Error ? err.message : "Invalid upload." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Upload file to storage ────────────────────────────────────────────────
  // Upload before extraction so the file is safe even if Claude returns an error.
  const randomId = crypto.randomUUID();
  const extension = isExcel ? "xlsx" : FILE_EXTENSIONS[file.type as ExtractableMediaType];
  const storagePath = `${user.id}/${randomId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { fallback: true, error: `Could not store the file: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;

  // ── Claude extraction ─────────────────────────────────────────────────────
  try {
    const rawFields = isExcel
      ? await extractJsonFromText<Record<string, unknown>>(workbookToText(buffer), EXCEL_EXTRACTION_PROMPT)
      : await extractJsonFromPdf<Record<string, unknown>>(
          buffer.toString("base64"),
          EXTRACTION_PROMPT,
          file.type as ExtractableMediaType
        );
    const fields = normalizeExtractedFields(rawFields);
    return NextResponse.json({ fields, pdfUrl } satisfies ExtractResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    // Return fallback — the PDF was already uploaded so the user keeps it
    return NextResponse.json(
      { fallback: true, error: message, pdfUrl } satisfies ExtractResponse,
      { status: 422 }
    );
  }
}
