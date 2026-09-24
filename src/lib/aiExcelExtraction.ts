import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/aiPdfExtraction";

// Sibling to aiPdfExtraction.ts — same model, same "no guessing" prompting
// pattern, same JSON-fence-stripping, but for real Excel files instead of
// PDFs/photos. Claude's document understanding doesn't parse .xlsx directly
// (see aiPdfExtraction.ts's comment on EXTRACTABLE_MEDIA_TYPES), so this
// converts the workbook to plain text first and sends that as a text block —
// which also sidesteps needing exact cell addresses, since real-world
// billing workbooks get rows added/deleted over time and stop matching
// whatever blank template they started from.

export const MAX_EXCEL_BYTES = 10 * 1024 * 1024; // 10 MB
export const EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// A sheet used purely for layout/formatting can report a used-range far
// larger than any real content (seen in a real file: a sheet's real data
// fits in ~30 columns / 80 rows, while an adjacent sheet's nominal range
// reported ~250 columns from a stray formatting edit — and a blank sheet
// elsewhere in the same workbook reported reaching column XFD, Excel's last
// possible column). Skipping a sheet outright by its nominal range risks
// dropping one that genuinely has real content past a smaller cutoff, so
// instead every sheet is kept but CLIPPED to this bound — generous enough
// for any real job-info/SOV sheet, small enough that even a runaway range
// costs at most one bounded chunk of empty commas, not millions of characters.
const MAX_SHEET_COLUMNS = 40; // through column AN
const MAX_SHEET_ROWS = 100;

export function validateExcelUpload(file: File | null): asserts file is File {
  if (!file) throw new Error("No file received.");
  if (file.type !== EXCEL_MEDIA_TYPE) throw new Error("Only .xlsx files are accepted.");
  if (file.size > MAX_EXCEL_BYTES) {
    throw new Error(`File is too large (maximum ${Math.round(MAX_EXCEL_BYTES / (1024 * 1024))} MB).`);
  }
}

export function workbookToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const sections: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const ref = sheet["!ref"];
    if (!ref) continue;

    // sheet_to_csv's TS types don't expose a `range` option (the JS
    // implementation does support one), so the clip is applied by
    // temporarily overwriting the sheet's own !ref instead — this
    // workbook is parsed once and discarded, so mutating it in place is fine.
    const range = XLSX.utils.decode_range(ref);
    const clippedRef = XLSX.utils.encode_range({
      s: range.s,
      e: {
        r: Math.min(range.e.r, MAX_SHEET_ROWS),
        c: Math.min(range.e.c, MAX_SHEET_COLUMNS),
      },
    });
    sheet["!ref"] = clippedRef;

    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csv.trim()) continue;

    sections.push(`=== SHEET: ${sheetName} ===\n${csv}`);
  }

  return sections.join("\n\n");
}

/** Sends workbook text to Claude with an extraction prompt and parses the JSON response. */
export async function extractJsonFromText<T>(text: string, prompt: string): Promise<T> {
  const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `${prompt}\n\n${text}` }],
      },
    ],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

  const jsonText = rawText.startsWith("```")
    ? rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    : rawText;

  return JSON.parse(jsonText) as T;
}
