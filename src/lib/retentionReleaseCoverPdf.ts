import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { JobSetup } from "@/lib/jobSetupData";
import { formatRetentionInvoiceNumber } from "@/lib/retentionReleasesDb";
import {
  NAVY,
  BORDER,
  MARGIN,
  PAGE_WIDTH,
  currency,
  percent,
  formatDate,
  addDays,
  splitAddress,
  drawHeaderField,
  drawAddressBlock,
  drawSummaryRow,
  LogoData,
} from "@/lib/invoiceCoverPdf";

export type RetentionReleaseCoverData = {
  job: JobSetup;
  releaseNumber: number;
  invoiceDate: string;
  releasedThrough: string;
  isFinal: boolean;
  retentionBasis: number;
  releaseAmount: number;
  // For traceability only — which pay application's SOV snapshot this
  // release's retention was computed against. Not rendered as a full SOV.
  sourceApplicationNumber: string;
  sourcePeriodTo: string;
  logo?: LogoData;
};

// A cover/invoice for a retention release — same visual language as
// buildInvoiceCoverDoc (logo, header fields, TO:/JOB: blocks, summary rows)
// but scoped to the release itself: one line (Retention Basis / Release % /
// Release $), not the full contract/change-order SOV breakout.
export function buildRetentionReleaseCoverDoc(data: RetentionReleaseCoverData) {
  const { job, releaseNumber, invoiceDate, releasedThrough, isFinal, retentionBasis, releaseAmount } = data;
  const releasePct = retentionBasis > 0 ? (releaseAmount / retentionBasis) * 100 : 0;

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });

  if (data.logo) {
    const LOGO_MAX_W = 220;
    const LOGO_MAX_H = 90;
    const { dataUrl, format, naturalW, naturalH } = data.logo;
    const scale = Math.min(LOGO_MAX_W / naturalW, LOGO_MAX_H / naturalH);
    doc.addImage(dataUrl, format, MARGIN, 28, naturalW * scale, naturalH * scale);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(NAVY);
    doc.text("RETENTION RELEASE INVOICE", MARGIN, 50);
  }

  let headerY = 36;
  const headerX = PAGE_WIDTH - MARGIN - 230;

  // drawHeaderField's default value column (x + 95) is sized for the pay
  // application cover's own labels and must stay untouched there. This
  // box's longest label, "RELEASED THROUGH:", doesn't fit inside 95pt, so
  // compute a column width from this box's actual labels and use it for
  // every row here — that keeps all five values aligned at one fixed
  // x-position regardless of label length, without changing the shared
  // pay-app cover's spacing.
  const headerLabels = ["INVOICE:", "INVOICE DATE:", "RELEASED THROUGH:", "RELEASE TYPE:", "DUE DATE:"];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const headerValueOffset = Math.max(...headerLabels.map((l) => doc.getTextWidth(l))) + 10;

  drawHeaderField(doc, "INVOICE:", formatRetentionInvoiceNumber(job.jobNumber, releaseNumber), headerX, headerY, "—", headerValueOffset);
  headerY += 14;
  drawHeaderField(doc, "INVOICE DATE:", formatDate(invoiceDate), headerX, headerY, "—", headerValueOffset);
  headerY += 14;
  drawHeaderField(doc, "RELEASED THROUGH:", formatDate(releasedThrough), headerX, headerY, "—", headerValueOffset);
  headerY += 14;
  drawHeaderField(doc, "RELEASE TYPE:", isFinal ? "Final" : "Partial", headerX, headerY, "—", headerValueOffset);
  headerY += 14;
  drawHeaderField(doc, "DUE DATE:", addDays(invoiceDate, 31), headerX, headerY, "—", headerValueOffset);

  let blockY = 140;
  const [toStreet, toCityStateZip] = splitAddress(job.customerAddress);
  const [jobStreet, jobCityStateZip] = splitAddress(job.jobAddress);
  const toBottom = drawAddressBlock(doc, "TO:", [job.customer, toStreet, toCityStateZip], MARGIN, blockY);
  const jobBottom = drawAddressBlock(
    doc,
    "JOB:",
    [job.jobName || job.jobNumber, jobStreet, jobCityStateZip],
    MARGIN + 280,
    blockY
  );
  blockY = Math.max(toBottom, jobBottom) + 18;

  autoTable(doc, {
    startY: blockY,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Description", "Retention Basis", "Release %", "Release $"]],
    body: [[
      isFinal ? "Final Retention Release" : "Partial Retention Release",
      currency(retentionBasis),
      percent(releasePct),
      currency(releaseAmount),
    ]],
    styles: { fontSize: 9, textColor: "#000000", lineColor: BORDER, lineWidth: 0.5 },
    headStyles: { fillColor: NAVY, textColor: "#ffffff", fontStyle: "bold" },
    bodyStyles: { halign: "right" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = tableEndY + 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor("#404040");
  doc.text(
    `Retention accrued through Pay Application #${data.sourceApplicationNumber} (period ending ${formatDate(data.sourcePeriodTo)}).`,
    MARGIN,
    y
  );
  y += 22;

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(PAGE_WIDTH - MARGIN - 230, y - 10, PAGE_WIDTH - MARGIN, y - 10);
  drawSummaryRow(doc, "Retention Release Due:", currency(releaseAmount), y + 4, { bold: true });

  return doc;
}
