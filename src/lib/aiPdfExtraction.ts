import Anthropic from "@anthropic-ai/sdk";
import type { DocumentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";

// Shared by every "AI import" feature (Import Contract, Import Change Order,
// ...) so they all use the same model, the same no-guessing prompting
// pattern, and the same JSON-fence-stripping. Each feature only supplies its
// own extraction prompt and expected shape.

export const MAX_EXTRACTION_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

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
  maxBytes: number = MAX_EXTRACTION_PDF_BYTES
): asserts file is File {
  if (!file) throw new Error("No file received.");
  if (!file.type.includes("pdf")) throw new Error("Only PDF files are accepted.");
  if (file.size > maxBytes) {
    throw new Error(`File is too large (maximum ${Math.round(maxBytes / (1024 * 1024))} MB).`);
  }
}

/** Sends a PDF to Claude with an extraction prompt and parses the JSON response. */
export async function extractJsonFromPdf<T>(base64Pdf: string, prompt: string): Promise<T> {
  const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });

  const docBlock: DocumentBlockParam = {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
  };

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [docBlock, { type: "text", text: prompt }],
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
