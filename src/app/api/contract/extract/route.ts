import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractJsonFromPdf, validatePdfUpload, getAnthropicApiKey } from "@/lib/aiPdfExtraction";

const BUCKET = "contract-pdfs";

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

  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ fallback: true, error: "Not signed in." }, { status: 401 });
  }

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
    validatePdfUpload(file);
  } catch (err) {
    return NextResponse.json(
      { fallback: true, error: err instanceof Error ? err.message : "Invalid upload." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  // ── Upload PDF to storage ─────────────────────────────────────────────────
  // Upload before extraction so the file is safe even if Claude returns an error.
  const randomId = crypto.randomUUID();
  const storagePath = `${user.id}/${randomId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { fallback: true, error: `Could not store the PDF: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;

  // ── Claude extraction ─────────────────────────────────────────────────────
  try {
    const fields = await extractJsonFromPdf<ExtractedFields>(base64, EXTRACTION_PROMPT);
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
