import { PDFDocument } from "pdf-lib";
import { buildPayApplicationDoc, PayAppPdfData } from "@/lib/payAppPdf";
import { buildInvoiceCoverDoc, InvoiceCoverData } from "@/lib/invoiceCoverPdf";
import { buildLienWaiverDoc, LienWaiverData, LienWaiverKind } from "@/lib/lienWaiverPdf";

export type BillingPackageData = {
  payApp: PayAppPdfData;
  invoiceCover: InvoiceCoverData;
  lienWaivers: { kind: LienWaiverKind; data: LienWaiverData }[];
};

function docBytes(doc: { output: (type: "arraybuffer") => ArrayBuffer }) {
  return doc.output("arraybuffer");
}

export async function buildMergedPackageBytes(data: BillingPackageData) {
  const sourceBytes: ArrayBuffer[] = [
    docBytes(buildInvoiceCoverDoc(data.invoiceCover)),
    docBytes(buildPayApplicationDoc(data.payApp, "g702")),
    docBytes(buildPayApplicationDoc(data.payApp, "sov")),
    ...data.lienWaivers.map((waiver) => docBytes(buildLienWaiverDoc(waiver.data, waiver.kind))),
  ];

  const merged = await PDFDocument.create();
  for (const bytes of sourceBytes) {
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  return merged.save();
}

export async function exportBillingPackage(data: BillingPackageData): Promise<Blob> {
  const mergedBytes = await buildMergedPackageBytes(data);
  const blob = new Blob([new Uint8Array(mergedBytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.payApp.job.jobNumber}-billing-package-app${data.payApp.applicationNumber || "1"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  return blob;
}
