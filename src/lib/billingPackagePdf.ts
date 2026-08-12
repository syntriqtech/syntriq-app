import { PDFDocument } from "pdf-lib";
import { buildPayApplicationDoc, PayAppPdfData } from "@/lib/payAppPdf";
import { buildInvoiceCoverDoc, InvoiceCoverData } from "@/lib/invoiceCoverPdf";
import { buildLienWaiverDoc, LienWaiverData, LienWaiverKind } from "@/lib/lienWaiverPdf";

export type BillingPackageData = {
  payApp: PayAppPdfData;
  invoiceCover: InvoiceCoverData;
  lienWaivers: { kind: LienWaiverKind; data: LienWaiverData }[];
};

// Exported so other package assemblers (e.g. the retention release invoice
// package) can merge their own set of jsPDF documents without re-implementing
// this — only the document list itself differs per package type.
export function docBytes(doc: { output: (type: "arraybuffer") => ArrayBuffer }) {
  return doc.output("arraybuffer");
}

export async function mergePdfSources(sourceBytes: ArrayBuffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of sourceBytes) {
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}

export function downloadPdfBlob(bytes: Uint8Array, filename: string): Blob {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return blob;
}

export async function buildMergedPackageBytes(data: BillingPackageData) {
  const sourceBytes: ArrayBuffer[] = [
    docBytes(buildInvoiceCoverDoc(data.invoiceCover)),
    docBytes(buildPayApplicationDoc(data.payApp, "g702")),
    docBytes(buildPayApplicationDoc(data.payApp, "sov")),
    ...data.lienWaivers.map((waiver) => docBytes(buildLienWaiverDoc(waiver.data, waiver.kind))),
  ];
  return mergePdfSources(sourceBytes);
}

export async function exportBillingPackage(data: BillingPackageData): Promise<Blob> {
  const mergedBytes = await buildMergedPackageBytes(data);
  return downloadPdfBlob(
    mergedBytes,
    `${data.payApp.job.jobNumber}-billing-package-app${data.payApp.applicationNumber || "1"}.pdf`
  );
}
