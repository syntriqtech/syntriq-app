import Anthropic from "@anthropic-ai/sdk";
import type {
  DocumentBlockParam,
  ImageBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages";

// Shared by every "AI import" feature (Import Contract, Import Change Order,
// ...) so they all use the same model, the same no-guessing prompting
// pattern, and the same JSON-fence-stripping. Each feature only supplies its
// own extraction prompt and expected shape.

export const MAX_EXTRACTION_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

// Claude reads these natively; image types cover a phone photo of a paper
// contract in place of a scanned PDF. Word/Excel aren't included — Claude's
// document understanding doesn't parse those without a separate conversion step.
export const EXTRACTABLE_MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ExtractableMediaType = (typeof EXTRACTABLE_MEDIA_TYPES)[number];

export function getAnthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Anthropic API key is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server."
    );
  }
  return apiKey;
}

export function validatePdfUpload(
  file: File | null,
  maxBytes: number = MAX_EXTRACTION_PDF_BYTES,
  allowedTypes: readonly string[] = ["application/pdf"]
): asserts file is File {
  if (!file) throw new Error("No file received.");
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      allowedTypes.length > 1 ? "Only PDF, JPG, or PNG files are accepted." : "Only PDF files are accepted."
    );
  }
  if (file.size > maxBytes) {
    throw new Error(`File is too large (maximum ${Math.round(maxBytes / (1024 * 1024))} MB).`);
  }
}

/** Sends a PDF or image to Claude with an extraction prompt and parses the JSON response. */
export async function extractJsonFromPdf<T>(
  base64Data: string,
  prompt: string,
  mediaType: ExtractableMediaType = "application/pdf"
): Promise<T> {
  const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });

  const fileBlock: DocumentBlockParam | ImageBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64Data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } };

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: prompt }],
      },
    ],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

  // Strip markdown fences if the model wrapped its output
  const jsonText = rawText.startsWith("```")
    ? rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    : rawText;

  return JSON.parse(jsonText) as T;
}
