import { NextRequest, NextResponse } from "next/server";
import { requireProPlan } from "@/lib/requirePlan";
import {
  extractJsonFromPdf,
  validatePdfUpload,
  getAnthropicApiKey,
  EXTRACTABLE_MEDIA_TYPES,
  type ExtractableMediaType,
} from "@/lib/aiPdfExtraction";

// Reuses the same "co-documents" bucket that approval docs already upload to
// (see uploadCoDocument in changeOrdersDb.ts) — imported CORs are stored
// under a per-user "import" prefix until the resulting CO is created, then
// the same URL is attached as that CO's approval doc.
const BUCKET = "co-documents";

const FILE_EXTENSIONS: Record<ExtractableMediaType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Works on any reasonably COR-shaped PDF — a single Clearstory-style COR
// form, a COR log/register export listing many CORs in one table, or any
// other change-order document — extract based on what the document actually
// says, not a fixed template.
const EXTRACTION_PROMPT = `You are extracting change order request (COR) information from a construction
change order document PDF. This may be a single COR request form (a Clearstory-style
export or any other layout), OR a COR log/register — a report listing many change order
requests for a project in one table. Extract based on what the document actually says.

Return ONLY a valid JSON object — no markdown, no commentary, just the JSON.
For every field include "value" (the extracted data, or null if not found) and "snippet"
(a short direct quote from the document that supports the value, or null).

NEVER guess or fabricate values. If a field is not clearly stated in the document, return null.

{
  "jobReference": { "value": string | null, "snippet": string | null },
  "changeOrders": [
    {
      "corNumber":       { "value": string | null, "snippet": string | null },
      "description":     { "value": string | null, "snippet": string | null },
      "date":            { "value": string | null, "snippet": string | null },
      "materialsAmount": { "value": number | null, "snippet": string | null },
      "laborAmount":     { "value": number | null, "snippet": string | null },
      "markupAmount":    { "value": number | null, "snippet": string | null },
      "totalAmount":     { "value": number | null, "snippet": string | null }
    }
  ]
}

Field rules:
- jobReference: the project/job name or number that every change order in this document
  belongs to, exactly as stated (e.g. from a "Project Name" or "Project" field). A COR log
  covers one project, so this applies to every entry in "changeOrders".
- changeOrders: one entry per distinct change order request.
  - If this document is a single COR/PCO request form, return exactly one entry for it.
  - If this document is a log/register — a table listing many change order requests, usually
    with columns like COR Number, Date Submitted, COR Title, and several dollar-amount columns
    (e.g. Requested, Approved CO Issued, Approved To Proceed, Void, In Review, Placeholder) —
    return one entry per data row, in the same order as the table. Skip the totals row at the
    bottom. Skip any row whose Status is "Void", or where every amount column is $0.00.
  - corNumber: this entry's own identifying number or title for the change order request
    (e.g. "COR-014", "1", "PCO #7") — not any internal numbering system, just whatever the
    document itself calls this request. On many single-COR forms this appears as a bare
    number placed right next to or below the "CHANGE ORDER REQUEST" heading (sometimes
    styled larger or in a different color), with no "COR Number:" label at all — treat that
    heading number as the corNumber too, not just an explicitly labeled field.
  - description: the scope of work this entry covers — if both a short title and a longer
    description are given, combine them (title first).
  - date: this entry's own date (issued or submitted), ISO format YYYY-MM-DD.
  - materialsAmount, laborAmount, markupAmount: dollar breakdown as plain numbers (not
    currency-formatted strings), only if THIS entry's own text itemizes its cost by category
    (materials/equipment, labor, markup/overhead/profit) — true for most single-COR forms,
    essentially never true for a log/register row. Return null for any category not broken
    out for that entry — do not split an unbroken total across categories. markupAmount is
    ONLY the markup/overhead/profit line itself (e.g. a line literally labeled "OH & P",
    "Overhead & Profit", or "Markup"). If the document separately shows a sales/use tax
    line, that tax amount is NOT part of this breakdown at all — do not add it into
    markupAmount or any other field; simply ignore the tax line completely when filling
    these three fields.
  - totalAmount: the single dollar amount that reflects this change order's real effect on
    the contract, as a plain number. Pick it in this priority order, using whichever of these
    the document actually gives for this entry:
      1. An "Approved" or "Approved CO Issued" amount, if stated — this is the amount actually
         added to the contract once approved, and can differ slightly from what was originally
         requested.
      2. Otherwise an "Approved To Proceed" amount, if stated.
      3. Otherwise the "Requested" amount (not yet approved).
    Never add these together, and never use a Void, In Review, or Placeholder amount as the
    totalAmount. For a single-COR form with just one stated total, use that. Do not compute or
    infer a total from a cost breakdown — only return one if the document itself states it.`;

export type CoEntryFields = {
  corNumber: { value: string | null; snippet: string | null };
  description: { value: string | null; snippet: string | null };
  date: { value: string | null; snippet: string | null };
  materialsAmount: { value: number | null; snippet: string | null };
  laborAmount: { value: number | null; snippet: string | null };
  markupAmount: { value: number | null; snippet: string | null };
  totalAmount: { value: number | null; snippet: string | null };
};

export type ExtractedCoFields = {
  jobReference: { value: string | null; snippet: string | null };
  changeOrders: CoEntryFields[];
};

export type CoExtractResponse =
  | { fields: ExtractedCoFields; pdfUrl: string }
  | { fallback: true; error: string; pdfUrl?: string };

// Claude occasionally flattens a {value, snippet} field into just its raw
// value — recover the real value either way rather than trusting every
// field to come back nested correctly (same guard used by the contract
// extraction route, which sees the same failure mode).
function toFieldValue<T>(raw: unknown): { value: T | null; snippet: string | null } {
  if (raw && typeof raw === "object" && "value" in raw) {
    const obj = raw as { value?: T | null; snippet?: string | null };
    return { value: obj.value ?? null, snippet: obj.snippet ?? null };
  }
  if (raw === undefined || raw === null) return { value: null, snippet: null };
  return { value: raw as T, snippet: null };
}

function normalizeCoEntry(raw: unknown): CoEntryFields {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    corNumber: toFieldValue<string>(r.corNumber),
    description: toFieldValue<string>(r.description),
    date: toFieldValue<string>(r.date),
    materialsAmount: toFieldValue<number>(r.materialsAmount),
    laborAmount: toFieldValue<number>(r.laborAmount),
    markupAmount: toFieldValue<number>(r.markupAmount),
    totalAmount: toFieldValue<number>(r.totalAmount),
  };
}

function normalizeExtractedCoFields(raw: Record<string, unknown> | null | undefined): ExtractedCoFields {
  const entries = Array.isArray(raw?.changeOrders) ? raw.changeOrders : [];
  return {
    jobReference: toFieldValue<string>(raw?.jobReference),
    changeOrders: entries.map(normalizeCoEntry),
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
  // Change Order AI import is Pro-only.
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
  try {
    validatePdfUpload(file, undefined, EXTRACTABLE_MEDIA_TYPES);
  } catch (err) {
    return NextResponse.json(
      { fallback: true, error: err instanceof Error ? err.message : "Invalid upload." },
      { status: 400 }
    );
  }
  const mediaType = file.type as ExtractableMediaType;

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  // ── Upload file to storage ────────────────────────────────────────────────
  // Upload before extraction so the file is safe even if Claude returns an error.
  const randomId = crypto.randomUUID();
  const storagePath = `${user.id}/import/${randomId}.${FILE_EXTENSIONS[mediaType]}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mediaType, upsert: false });

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
    const rawFields = await extractJsonFromPdf<Record<string, unknown>>(base64, EXTRACTION_PROMPT, mediaType);
    const fields = normalizeExtractedCoFields(rawFields);
    return NextResponse.json({ fields, pdfUrl } satisfies CoExtractResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    // Return fallback — the PDF was already uploaded so the user keeps it
    return NextResponse.json(
      { fallback: true, error: message, pdfUrl } satisfies CoExtractResponse,
      { status: 422 }
    );
  }
}
