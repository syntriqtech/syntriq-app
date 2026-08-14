import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

// Works on any reasonably COR-shaped PDF — Clearstory export or otherwise —
// not hardcoded to one platform's layout.
const EXTRACTION_PROMPT = `You are extracting change order request (COR) information from a construction
change order document PDF. This may be a Clearstory COR export or any other change-order
document — extract based on what the document actually says, not a fixed template.

Return ONLY a valid JSON object — no markdown, no commentary, just the JSON.
For every field include "value" (the extracted data, or null if not found) and "snippet"
(a short direct quote from the document that supports the value, or null).

NEVER guess or fabricate values. If a field is not clearly stated in the document, return null.

{
  "corNumber":       { "value": string | null, "snippet": string | null },
  "jobReference":    { "value": string | null, "snippet": string | null },
  "description":     { "value": string | null, "snippet": string | null },
  "date":            { "value": string | null, "snippet": string | null },
  "materialsAmount": { "value": number | null, "snippet": string | null },
  "laborAmount":     { "value": number | null, "snippet": string | null },
  "markupAmount":    { "value": number | null, "snippet": string | null },
  "totalAmount":     { "value": number | null, "snippet": string | null }
}

Field rules:
- corNumber: this document's own identifying number or title for the change order request
  (e.g. "COR-014", "PCO #7", "Change Order Request 3") — not any internal numbering system,
  just whatever the document itself calls this request
- jobReference: the project/job name or number this COR is for, exactly as stated in the document
- description: the scope of work this change order covers — if the document has both a short
  title and a detailed description, combine them (title first)
- date: the COR's own date (issued or submitted date), ISO format YYYY-MM-DD
- materialsAmount, laborAmount, markupAmount: dollar breakdown as plain numbers (not
  currency-formatted strings), only if the document itemizes cost by category (materials/
  equipment, labor, markup/overhead/profit). Return null for any category not broken out —
  do not split an unbroken total across categories.
- totalAmount: the total dollar amount of this change order, as explicitly stated in the
  document, as a plain number. Do not compute or infer this from the breakdown — only return
  it if the document itself states a total.`;

export type ExtractedCoFields = {
  corNumber: { value: string | null; snippet: string | null };
  jobReference: { value: string | null; snippet: string | null };
  description: { value: string | null; snippet: string | null };
  date: { value: string | null; snippet: string | null };
  materialsAmount: { value: number | null; snippet: string | null };
  laborAmount: { value: number | null; snippet: string | null };
  markupAmount: { value: number | null; snippet: string | null };
  totalAmount: { value: number | null; snippet: string | null };
};

export type CoExtractResponse =
  | { fields: ExtractedCoFields; pdfUrl: string }
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
    const fields = await extractJsonFromPdf<ExtractedCoFields>(base64, EXTRACTION_PROMPT, mediaType);
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
