import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CompanyProfile } from "@/lib/companyProfileDb";
import { LogoData, loadLogoForPdf } from "@/lib/invoiceCoverPdf";

export { loadLogoForPdf };
export type { LogoData };

const NAVY = "#1F3864";
const LABEL_GRAY = "#404040";
const SUBTITLE_GRAY = "#595959";
const BORDER = "#BFBFBF";
const ROW_ALT = "#F4F7FB";
const TOTALS_FILL = "#D9E2F3";
const MARGIN = 40;

export type ReportPdfColumn = { header: string; align?: "left" | "center" | "right" };

export type ReportPdfData = {
  title: string;
  subtitle: string;
  companyProfile: CompanyProfile | null;
  logo: LogoData | null;
  columns: ReportPdfColumn[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  generatedAt: Date;
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Branded header matching the billing-package PDFs: logo (if uploaded) + company
// name/address at top-left, report title/subtitle below, then the data table.
export function buildReportPdf(data: ReportPdfData) {
  const orientation = data.columns.length > 6 ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation });

  let headerBottom = MARGIN;
  if (data.logo) {
    const LOGO_MAX_W = 140;
    const LOGO_MAX_H = 56;
    const scale = Math.min(LOGO_MAX_W / data.logo.naturalW, LOGO_MAX_H / data.logo.naturalH);
    const w = data.logo.naturalW * scale;
    const h = data.logo.naturalH * scale;
    doc.addImage(data.logo.dataUrl, data.logo.format, MARGIN, MARGIN, w, h);
    headerBottom = Math.max(headerBottom, MARGIN + h);
  }

  const textX = data.logo ? MARGIN + 160 : MARGIN;
  let y = MARGIN + 12;
  if (data.companyProfile?.companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(NAVY);
    doc.text(data.companyProfile.companyName, textX, y);
    y += 14;
  }
  if (data.companyProfile?.companyAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(LABEL_GRAY);
    doc.text(data.companyProfile.companyAddress, textX, y);
    y += 12;
  }
  headerBottom = Math.max(headerBottom, y);

  let titleY = headerBottom + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(NAVY);
  doc.text(data.title, MARGIN, titleY);
  titleY += 15;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(SUBTITLE_GRAY);
  doc.text(data.subtitle, MARGIN, titleY);
  titleY += 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(SUBTITLE_GRAY);
  doc.text(`Generated ${formatDate(data.generatedAt)}`, MARGIN, titleY);
  titleY += 14;

  const columnStyles: Record<number, { halign: "left" | "center" | "right" }> = {};
  data.columns.forEach((col, idx) => {
    columnStyles[idx] = { halign: col.align ?? "left" };
  });

  autoTable(doc, {
    startY: titleY,
    margin: { left: MARGIN, right: MARGIN },
    head: [data.columns.map((c) => c.header)],
    body: data.rows,
    foot: data.totalsRow ? [data.totalsRow] : undefined,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      textColor: "#000000",
      lineColor: BORDER,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: "#FFFFFF",
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },
    footStyles: {
      fillColor: TOTALS_FILL,
      textColor: "#000000",
      fontStyle: "bold",
    },
    columnStyles,
    didParseCell: (cellData) => {
      if (cellData.section === "body" && cellData.row.index % 2 === 1) {
        cellData.cell.styles.fillColor = ROW_ALT;
      }
    },
  });

  return doc;
}

export function exportReportPdf(data: ReportPdfData, filename: string) {
  const doc = buildReportPdf(data);
  doc.save(filename);
}
