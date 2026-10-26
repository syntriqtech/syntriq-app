import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { downloadStoredMaterialFile } from "@/lib/storedMaterialsDb";
import {
  PackageSectionKey,
  SECTION_LABELS,
  StoredMaterialDocument,
  StoredMaterialEntry,
} from "@/lib/storedMaterialsMath";

export type PackageSection = {
  key: PackageSectionKey;
  label: string;
  bytes: Uint8Array;
  pageCount: number;
};

export type StoredMaterialsItem = { entry: StoredMaterialEntry; docs: StoredMaterialDocument[] };

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;

async function loadBytes(doc: StoredMaterialDocument): Promise<Uint8Array> {
  return new Uint8Array(await (await downloadStoredMaterialFile(doc.filePath)).arrayBuffer());
}

async function embedImage(pdf: PDFDocument, doc: StoredMaterialDocument, bytes: Uint8Array): Promise<PDFImage> {
  return doc.mimeType === "image/png" ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

/** Standard fonts only handle Latin-1; swap anything else for "?" so drawing never throws. */
function safeText(text: string) {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const t = safeText(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  let n = t.length;
  while (n > 1 && font.widthOfTextAtSize(t.slice(0, n) + "...", size) > maxWidth) n--;
  return t.slice(0, n) + "...";
}

function drawImageFitted(page: PDFPage, image: PDFImage, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  page.drawImage(image, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
}

/** Appends a file as-is: PDFs keep their pages, JPG/PNG become one page. */
async function appendDocument(pdf: PDFDocument, doc: StoredMaterialDocument) {
  const bytes = await loadBytes(doc);
  if (doc.mimeType === "application/pdf") {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach((p) => pdf.addPage(p));
    return;
  }
  const image = await embedImage(pdf, doc, bytes);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawImageFitted(page, image, MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2);
}

/** Photos: 2 x 2 grid (4 per page), each labeled with its SOV line (item number and description). */
async function buildPhotoPages(
  pdf: PDFDocument,
  photos: { doc: StoredMaterialDocument; entry: StoredMaterialEntry }[],
  problems: string[]
) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const gap = 18;
  const cellW = (PAGE_W - MARGIN * 2 - gap) / 2;
  const cellH = (PAGE_H - MARGIN * 2 - gap) / 2;
  const labelH = 26;

  for (let i = 0; i < photos.length; i += 4) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    for (let j = 0; j < 4 && i + j < photos.length; j++) {
      const { doc, entry } = photos[i + j];
      const col = j % 2;
      const row = Math.floor(j / 2);
      const x = MARGIN + col * (cellW + gap);
      const yTop = PAGE_H - MARGIN - row * (cellH + gap);
      let image: PDFImage;
      try {
        image = await embedImage(pdf, doc, await loadBytes(doc));
      } catch {
        problems.push(`${doc.fileName} could not be added to the package`);
        continue;
      }
      drawImageFitted(page, image, x, yTop - cellH + labelH, cellW, cellH - labelH);

      const label = [`Item ${entry.sovItem}`, entry.description.trim()].filter(Boolean).join(" — ");
      page.drawText(fitText(font, label, 9, cellW), { x, y: yTop - cellH + 8, size: 9, font, color: rgb(0.09, 0.22, 0.29) });
    }
  }
}

/**
 * Builds one PDF per package section (empty sections are skipped) so the page
 * can show page counts and let the user reorder them. A file that can't be
 * read is skipped and reported in `problems` instead of failing the package.
 */
export async function buildStoredMaterialSections(
  items: StoredMaterialsItem[],
  coi: StoredMaterialDocument | null
): Promise<{ sections: PackageSection[]; problems: string[] }> {
  const problems: string[] = [];
  const sections: PackageSection[] = [];

  async function build(key: PackageSectionKey, fill: (pdf: PDFDocument) => Promise<void>) {
    const pdf = await PDFDocument.create();
    try {
      await fill(pdf);
    } catch (err) {
      problems.push(`${SECTION_LABELS[key]}: ${err instanceof Error ? err.message : "could not be read"}`);
    }
    if (pdf.getPageCount() === 0) return;
    sections.push({ key, label: SECTION_LABELS[key], bytes: await pdf.save(), pageCount: pdf.getPageCount() });
  }

  const docsOfType = (type: StoredMaterialDocument["docType"]) =>
    items.flatMap(({ entry, docs }) => docs.filter((d) => d.docType === type).map((doc) => ({ doc, entry })));

  if (coi) await build("coi", (pdf) => appendDocument(pdf, coi));

  for (const key of ["bill_of_sale", "invoice"] as const) {
    const list = docsOfType(key);
    await build(key, async (pdf) => {
      for (const { doc } of list) {
        try {
          await appendDocument(pdf, doc);
        } catch {
          problems.push(`${doc.fileName} could not be added to the package`);
        }
      }
    });
  }

  const photos = docsOfType("photo");
  // Image photos go in the labeled grid; any PDF "photos" are appended as-is after it.
  await build("photo", async (pdf) => {
    await buildPhotoPages(pdf, photos.filter((p) => p.doc.mimeType !== "application/pdf"), problems);
    for (const { doc } of photos.filter((p) => p.doc.mimeType === "application/pdf")) {
      try {
        await appendDocument(pdf, doc);
      } catch {
        problems.push(`${doc.fileName} could not be added to the package`);
      }
    }
  });

  const proofs = docsOfType("storage_proof");
  await build("storage_proof", async (pdf) => {
    for (const { doc } of proofs) {
      try {
        await appendDocument(pdf, doc);
      } catch {
        problems.push(`${doc.fileName} could not be added to the package`);
      }
    }
  });

  return { sections, problems };
}
