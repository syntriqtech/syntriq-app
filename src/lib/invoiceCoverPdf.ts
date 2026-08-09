import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { JobSetup } from "@/lib/jobSetupData";
import { SOVLineItem } from "@/lib/sovData";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";

export type LogoData = {
  dataUrl: string;
  format: "JPEG" | "PNG";
  naturalW: number;
  naturalH: number;
};

export type InvoiceCoverData = {
  job: JobSetup;
  contractLineItems: SOVLineItem[];
  changeOrderItems: SOVLineItem[];
  cwRate: number;
  smRate: number;
  applicationNumber: string;
  invoiceDate: string;
  periodTo: string;
  gcProjectNumber: string;
  logo?: LogoData;
};

// Fetches a logo image URL and converts it to the data needed by buildInvoiceCoverDoc.
// Returns null if the URL cannot be loaded (PDF renders cleanly without the logo).
export async function loadLogoForPdf(logoUrl: string): Promise<LogoData | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const isJpeg = blob.type.includes("jpeg") || blob.type.includes("jpg");
    const format: "JPEG" | "PNG" = isJpeg ? "JPEG" : "PNG";
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { w, h } = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = dataUrl;
    });
    return { dataUrl, format, naturalW: w, naturalH: h };
  } catch {
    return null;
  }
}

const NAVY = "#1F3864";
const LABEL_GRAY = "#404040";
const BORDER = "#000000";
const MARGIN = 40;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function currency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function percent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function addDays(value: string, days: number) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function drawHeaderField(doc: jsPDF, label: string, value: string, x: number, y: number, fallback = "—") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(LABEL_GRAY);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#000000");
  const display = value || fallback;
  if (display) doc.text(display, x + 95, y);
}

// Splits "Street, Suite, City, ST 00000" into ["Street, Suite", "City, ST 00000"].
// Falls back to returning the whole string as line 1 if no US city/state/zip is found.
function splitAddress(address: string): [string, string] {
  const match = address.match(/^(.*),\s*([^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)$/);
  if (match) return [match[1].trim(), match[2].trim()];
  return [address, ""];
}

function drawAddressBlock(doc: jsPDF, label: string, lines: string[], x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(LABEL_GRAY);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#000000");
  let lineY = y + 13;
  lines.forEach((line) => {
    if (!line) return;
    doc.text(line, x, lineY);
    lineY += 12;
  });
  return lineY;
}

function drawSummaryRow(doc: jsPDF, label: string, value: string, y: number, options?: { bold?: boolean }) {
  doc.setFont("helvetica", options?.bold ? "bold" : "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(options?.bold ? NAVY : "#000000");
  doc.text(label, PAGE_WIDTH - MARGIN - 230, y);
  doc.text(value, PAGE_WIDTH - MARGIN, y, { align: "right" });
  return y + 15;
}

export function buildInvoiceCoverDoc(data: InvoiceCoverData) {
  const { job, contractLineItems, changeOrderItems, cwRate, smRate } = data;

  const computedContract = contractLineItems.map((line) => computeLine(line, cwRate, smRate));
  const computedChangeOrders = changeOrderItems.map((line) => computeLine(line, cwRate, smRate));
  const contractTotals = sumLines(computedContract);
  const changeOrderTotals = sumLines(computedChangeOrders);
  const allLines = [...contractLineItems, ...changeOrderItems];
  const grandTotals = sumLines([...computedContract, ...computedChangeOrders]);

  const totalEarnedLessRetainage = grandTotals.totalCompleted - grandTotals.retention;
  const prevNetBilled = previousCertificates(allLines, cwRate);
  const currentPaymentDue = totalEarnedLessRetainage - prevNetBilled;

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });

  if (data.logo) {
    // Larger box when title is absent — logo is the only thing in this space
    const LOGO_MAX_W = 220;
    const LOGO_MAX_H = 90;
    const { dataUrl, format, naturalW, naturalH } = data.logo;
    const scale = Math.min(LOGO_MAX_W / naturalW, LOGO_MAX_H / naturalH);
    doc.addImage(dataUrl, format, MARGIN, 28, naturalW * scale, naturalH * scale);
    // No "INVOICE" title — logo takes the header space
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(NAVY);
    doc.text("INVOICE", MARGIN, 50);
  }

  let headerY = 36;
  const headerX = PAGE_WIDTH - MARGIN - 230;
  drawHeaderField(doc, "INVOICE:", `${job.jobNumber}-${data.applicationNumber}`, headerX, headerY);
  headerY += 14;
  drawHeaderField(doc, "INVOICE DATE:", formatDate(data.invoiceDate), headerX, headerY);
  headerY += 14;
  drawHeaderField(doc, "PERIOD TO:", formatDate(data.periodTo), headerX, headerY);
  headerY += 14;
  drawHeaderField(doc, "APPLICATION:", data.applicationNumber, headerX, headerY);
  headerY += 14;
  drawHeaderField(doc, "DUE DATE:", addDays(data.invoiceDate, 31), headerX, headerY);
  headerY += 14;
  drawHeaderField(doc, "GC PROJECT:", data.gcProjectNumber, headerX, headerY, "");

  let blockY = 140;
  const [toStreet, toCityStateZip] = splitAddress(job.customerAddress);
  const [jobStreet, jobCityStateZip] = splitAddress(job.jobAddress);
  const toBottom  = drawAddressBlock(doc, "TO:",  [job.customer,               toStreet,  toCityStateZip],  MARGIN,        blockY);
  const jobBottom = drawAddressBlock(doc, "JOB:", [job.jobName || job.jobNumber, jobStreet, jobCityStateZip], MARGIN + 280,  blockY);
  blockY = Math.max(toBottom, jobBottom) + 18;

  autoTable(doc, {
    startY: blockY,
    margin: { left: MARGIN, right: MARGIN },
    head: [[
      "Description",
      "Scheduled Value",
      "Previous Applications",
      "Current Completed",
      "Stored Materials",
      "Total Completed",
      "%",
      "Balance to Finish",
      "Retainage",
    ]],
    body: [
      [
        "Contract",
        currency(contractTotals.scheduledValue),
        currency(contractTotals.previousApplications),
        currency(contractTotals.thisPeriod),
        currency(contractTotals.storedMaterials),
        currency(contractTotals.totalCompleted),
        percent(contractTotals.percentComplete),
        currency(contractTotals.balanceToFinish),
        currency(contractTotals.retention),
      ],
      [
        "Change Orders",
        currency(changeOrderTotals.scheduledValue),
        currency(changeOrderTotals.previousApplications),
        currency(changeOrderTotals.thisPeriod),
        currency(changeOrderTotals.storedMaterials),
        currency(changeOrderTotals.totalCompleted),
        percent(changeOrderTotals.percentComplete),
        currency(changeOrderTotals.balanceToFinish),
        currency(changeOrderTotals.retention),
      ],
      [
        "Totals",
        currency(grandTotals.scheduledValue),
        currency(grandTotals.previousApplications),
        currency(grandTotals.thisPeriod),
        currency(grandTotals.storedMaterials),
        currency(grandTotals.totalCompleted),
        percent(grandTotals.percentComplete),
        currency(grandTotals.balanceToFinish),
        currency(grandTotals.retention),
      ],
    ],
    styles: { fontSize: 7.5, textColor: "#000000", lineColor: BORDER, lineWidth: 0.5 },
    headStyles: { fillColor: "#1F3864", textColor: "#ffffff", fontStyle: "bold" },
    bodyStyles: { halign: "right" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.row.index === 2) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = "#E8EEF3";
      }
    },
  });

  const tableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let summaryY = tableEndY + 30;

  summaryY = drawSummaryRow(doc, "Total Complete & Stored to Date:", currency(grandTotals.totalCompleted), summaryY);
  summaryY = drawSummaryRow(doc, "Total Current Retainage Held:", currency(grandTotals.retention), summaryY);
  summaryY = drawSummaryRow(doc, "Total Earned Less Retainage:", currency(totalEarnedLessRetainage), summaryY);
  summaryY = drawSummaryRow(doc, "Less Previous Net Billed:", currency(prevNetBilled), summaryY);
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(PAGE_WIDTH - MARGIN - 230, summaryY - 10, PAGE_WIDTH - MARGIN, summaryY - 10);
  drawSummaryRow(doc, "Current Payment Due:", currency(currentPaymentDue), summaryY + 4, { bold: true });

  return doc;
}

export function exportInvoiceCoverPdf(data: InvoiceCoverData) {
  const doc = buildInvoiceCoverDoc(data);
  doc.save(`${data.job.jobNumber}-invoice-cover.pdf`);
}
