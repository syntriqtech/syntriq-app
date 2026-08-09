import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SOVLineItem } from "@/lib/sovData";
import { JobSetup } from "@/lib/jobSetupData";
import { computeLine, sumLines, previousCertificates } from "@/lib/payAppMath";

export type PdfScope = "sov" | "g702" | "packet";

export type PayAppPdfData = {
  job: JobSetup;
  contractorName: string;
  contractorAddress: string;
  applicationNumber: string;
  applicationDate: string;
  periodTo: string;
  lineItems: SOVLineItem[];
  changeOrders: SOVLineItem[];
  cwRate: number;
  smRate: number;
  signatureDataUrl?: string;
};

const NAVY = "#1F3864";
const BORDER = "#BFBFBF";
const LABEL_GRAY = "#404040";
const SUBTITLE_GRAY = "#595959";
const ROW_ALT = "#F4F7FB";
const TOTALS_FILL = "#D9E2F3";
const SUMMARY_HIGHLIGHT = "#DCE6F1";
const SUMMARY_FINAL = "#D9E2F3";
const MARGIN = 36;

const LINE_ITEM_COLUMN_WIDTHS = [30, 130, 75, 75, 75, 75, 75, 55, 75, 55];

function currency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function drawTitle(doc: jsPDF, title: string, subtitle: string) {
  doc.setTextColor(NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, MARGIN, MARGIN + 6);

  doc.setTextColor(SUBTITLE_GRAY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text(subtitle, MARGIN, MARGIN + 22);
}

function truncateToWidth(doc: jsPDF, text: string, maxWidth: number) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(`${truncated}...`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

function drawInfoBoxes(
  doc: jsPDF,
  columns: [string, string][][],
  top: number,
  colWidths: number[],
  startX: number = MARGIN
) {
  const maxFields = Math.max(...columns.map((fields) => fields.length));
  const rowHeight = maxFields * 11 + 6;

  let x = startX;
  columns.forEach((fields, colIndex) => {
    const colWidth = colWidths[colIndex];
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.5);
    doc.rect(x, top, colWidth, rowHeight);

    // Center the content block within the shared box height.
    // topPad places the midpoint of (first..last) baselines at the box midpoint.
    const lineH = 11;
    const topPad = (rowHeight - Math.max(0, fields.length - 1) * lineH) / 2;
    fields.forEach(([label, value], rowIndex) => {
      const fieldY = top + topPad + rowIndex * lineH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(LABEL_GRAY);
      const labelWidth = label ? doc.getTextWidth(`${label} `) : 0;
      if (label) {
        doc.text(label, x + 8, fieldY);
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor("#000000");
      const valueX = x + 8 + labelWidth + (label ? 4 : 0);
      const availableWidth = colWidth - 8 - labelWidth - (label ? 4 : 0) - 6;
      doc.text(truncateToWidth(doc, value || "—", availableWidth), valueX, fieldY);
    });

    x += colWidth;
  });

  return top + rowHeight;
}

// Splits "Street, City, ST 00000" into ["Street", "City, ST 00000"].
function splitAddress(address: string): [string, string] {
  const match = address.match(/^(.*),\s*([^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)$/);
  if (match) return [match[1].trim(), match[2].trim()];
  return [address, ""];
}

// Computes the box height needed to fit all fields with text wrapping.
function computeWrappedBoxHeight(doc: jsPDF, fields: [string, string][], colWidth: number): number {
  const LINE_H = 11;
  const PAD_X = 8;
  let totalLines = 0;
  for (const [label, value] of fields) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const labelWidth = label ? doc.getTextWidth(`${label} `) : 0;
    const textWidth = colWidth - PAD_X * 2 - labelWidth - (label ? 4 : 0);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "", Math.max(textWidth, 10));
    totalLines += Math.max(lines.length, 1);
  }
  return totalLines * LINE_H + 12;
}

// Draws a single info box with text wrapping instead of truncation.
function drawInfoBoxWrapping(
  doc: jsPDF,
  fields: [string, string][],
  x: number,
  y: number,
  colWidth: number,
  boxHeight: number
): void {
  const LINE_H = 11;
  const PAD_X = 8;

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.rect(x, y, colWidth, boxHeight);

  type Pre = { label: string; labelWidth: number; lines: string[] };
  const precomputed: Pre[] = fields.map(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const labelWidth = label ? doc.getTextWidth(`${label} `) : 0;
    const textWidth = colWidth - PAD_X * 2 - labelWidth - (label ? 4 : 0);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "", Math.max(textWidth, 10));
    return { label, labelWidth, lines };
  });

  const topPad = 8;
  let textY = y + topPad + LINE_H * 0.75;
  for (const { label, labelWidth, lines } of precomputed) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(LABEL_GRAY);
    if (label) doc.text(label, x + PAD_X, textY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#000000");
    if (lines.length > 0) {
      doc.text(lines, x + PAD_X + labelWidth + (label ? 4 : 0), textY);
    }
    textY += Math.max(lines.length, 1) * LINE_H;
  }
}

function drawTitleAndInfo(doc: jsPDF, data: PayAppPdfData, title: string, subtitle: string) {
  drawTitle(doc, title, subtitle);

  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - MARGIN * 2;
  const colWidth = tableWidth / 3;
  const top = MARGIN + 34;

  const columns: [string, string][][] = [
    [
      ["Contractor:", data.contractorName],
      ["Project / Job:", data.job.jobName || data.job.jobNumber],
    ],
    [
      ["Owner:", data.job.owner],
      ["Architect:", data.job.architect],
    ],
    [
      ["Application #:", data.applicationNumber],
      ["Application Date:", formatDate(data.applicationDate)],
      ["Period To:", formatDate(data.periodTo)],
      ["Contract Date:", formatDate(data.job.contractDate)],
    ],
  ];

  const bottom = drawInfoBoxes(doc, columns, top, [colWidth, colWidth, colWidth]);
  return bottom + 26;
}

function drawG702Header(doc: jsPDF, data: PayAppPdfData, title: string, subtitle: string) {
  drawTitle(doc, title, subtitle);

  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - MARGIN * 2;
  const col1Width = tableWidth * 0.27;
  const col2Width = tableWidth * 0.27;
  const col3Width = tableWidth * 0.28;
  const col4Width = tableWidth - col1Width - col2Width - col3Width;
  const top = MARGIN + 34;
  const stackedRowHeight = 30;

  const col1X = MARGIN;
  const col2X = col1X + col1Width;
  const col3X = col2X + col2Width;
  const col4X = col3X + col3Width;

  // "To Contractor" = the GC/customer; "From Subcontractor" = our company
  const [gcStreet, gcCityStateZip]   = splitAddress(data.job.customerAddress);
  const [subStreet, subCityStateZip] = splitAddress(data.contractorAddress);
  const [jobStreet, jobCityStateZip] = splitAddress(data.job.jobAddress);

  const toOwnerFields: [string, string][] = [
    ["To Contractor:", data.job.customer],
    ...(gcStreet        ? [["", gcStreet]        as [string, string]] : []),
    ...(gcCityStateZip  ? [["", gcCityStateZip]  as [string, string]] : []),
  ];
  const fromContractorFields: [string, string][] = [
    ["From Subcontractor:", data.contractorName],
    ...(subStreet       ? [["", subStreet]       as [string, string]] : []),
    ...(subCityStateZip ? [["", subCityStateZip] as [string, string]] : []),
  ];
  const projectFields: [string, string][] = [
    ["Project:", data.job.jobName || data.job.jobNumber],
    ...(jobStreet       ? [["", jobStreet]       as [string, string]] : []),
    ...(jobCityStateZip ? [["", jobCityStateZip] as [string, string]] : []),
  ];
  const viaArchitectFields: [string, string][] = [["Via Architect:", data.job.architect], ["", ""]];

  const row1Height = Math.max(
    computeWrappedBoxHeight(doc, toOwnerFields, col1Width),
    computeWrappedBoxHeight(doc, projectFields, col2Width),
    stackedRowHeight
  );
  const row2Height = Math.max(
    computeWrappedBoxHeight(doc, fromContractorFields, col1Width),
    computeWrappedBoxHeight(doc, viaArchitectFields, col2Width),
    stackedRowHeight
  );

  drawInfoBoxWrapping(doc, toOwnerFields,        col1X, top,              col1Width, row1Height);
  drawInfoBoxWrapping(doc, fromContractorFields, col1X, top + row1Height, col1Width, row2Height);
  drawInfoBoxWrapping(doc, projectFields,        col2X, top,              col2Width, row1Height);
  drawInfoBoxWrapping(doc, viaArchitectFields,   col2X, top + row1Height, col2Width, row2Height);

  drawInfoBoxes(
    doc,
    [
      [
        ["Application No:", data.applicationNumber],
        ["Period To:", formatDate(data.periodTo)],
        ["Subcontract For:", data.job.contractFor],
        ["Subcontract Date:", formatDate(data.job.contractDate)],
        ["GC Project #:", data.job.architectProjectNumber],
      ],
    ],
    top,
    [col3Width],
    col3X
  );

  const distributionTop = top;
  const distributionHeight = row1Height + row2Height;
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.rect(col4X, distributionTop, col4Width, distributionHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(LABEL_GRAY);
  doc.text("Distribution To:", col4X + 6, distributionTop + 9);
  doc.setFont("helvetica", "normal");
  const distributionRows = ["Owner", "Architect", "Contractor", "Field", "Other"];
  const distributionLineGap = (distributionHeight - 12) / distributionRows.length;
  distributionRows.forEach((label, index) => {
    const rowY = distributionTop + 18 + distributionLineGap * index;
    doc.text(label, col4X + 6, rowY);
    doc.text("[ ]", col4X + col4Width - 22, rowY);
  });

  return top + row1Height + row2Height + 22;
}

function drawSectionHeading(doc: jsPDF, text: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(NAVY);
  doc.text(text, MARGIN, y);
  return y + 11;
}

const TABLE_HEADERS = [
  "Item",
  "Description",
  "Scheduled\nValue",
  "Previous\nApplications",
  "This\nPeriod",
  "Stored\nMaterials",
  "Total\nCompleted",
  "%\nComplete",
  "Balance to\nFinish",
  "Retention",
];

function drawLineItemsTable(doc: jsPDF, items: SOVLineItem[], cwRate: number, smRate: number, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();

  if (items.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(SUBTITLE_GRAY);
    doc.text("None", MARGIN, startY + 12);
    return startY + 26;
  }

  const rows = items.map((line) => computeLine(line, cwRate, smRate));
  const totals = sumLines(rows);

  const body = rows.map((row) => [
    row.item,
    row.description || "—",
    currency(row.scheduledValue),
    currency(row.previousApplications),
    currency(row.thisPeriod),
    currency(row.storedMaterials),
    currency(row.totalCompleted),
    `${row.percentComplete.toFixed(1)}%`,
    currency(row.balanceToFinish),
    currency(row.retention),
  ]);

  const footRow = [
    "",
    "Totals",
    currency(totals.scheduledValue),
    currency(totals.previousApplications),
    currency(totals.thisPeriod),
    currency(totals.storedMaterials),
    currency(totals.totalCompleted),
    `${totals.percentComplete.toFixed(1)}%`,
    currency(totals.balanceToFinish),
    currency(totals.retention),
  ];

  const columnStyles: Record<number, { cellWidth: number; halign: "left" | "center" | "right" }> = {
    0: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[0], halign: "center" },
    1: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[1], halign: "left" },
    2: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[2], halign: "right" },
    3: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[3], halign: "right" },
    4: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[4], halign: "right" },
    5: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[5], halign: "right" },
    6: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[6], halign: "right" },
    7: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[7], halign: "center" },
    8: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[8], halign: "right" },
    9: { cellWidth: LINE_ITEM_COLUMN_WIDTHS[9], halign: "right" },
  };

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    head: [TABLE_HEADERS],
    body,
    foot: [footRow],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      textColor: "#000000",
      lineColor: BORDER,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: "#FFFFFF",
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      valign: "middle",
    },
    footStyles: {
      fillColor: TOTALS_FILL,
      textColor: "#000000",
      fontStyle: "bold",
    },
    columnStyles,
    tableWidth: pageWidth - MARGIN * 2,
    didParseCell: (cellData) => {
      if (cellData.section === "body" && cellData.row.index % 2 === 1) {
        cellData.cell.styles.fillColor = ROW_ALT;
      }
    },
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
}

function drawApplicationSummary(doc: jsPDF, data: PayAppPdfData, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - MARGIN * 2;
  const valueColWidth = 150;
  const labelColWidth = tableWidth - valueColWidth;

  const allRows = [
    ...data.lineItems.map((line) => computeLine(line, data.cwRate, data.smRate)),
    ...data.changeOrders.map((line) => computeLine(line, data.cwRate, data.smRate)),
  ];
  const totals = sumLines(allRows);
  const netChangeOrders = data.changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
  const contractSumToDate = data.job.contractValue + netChangeOrders;
  const totalEarnedLessRetainage = totals.totalCompleted - totals.retention;

  // Shading rule: rows that consolidate or derive from values above get SUMMARY_HIGHLIGHT;
  // the final Balance to Finish row gets SUMMARY_FINAL for emphasis.
  // Input rows (Original Contract, Net COs, Total Completed) are plain white.
  const summaryRows: { label: string; value: string; fill?: string }[] = [
    { label: "Original Contract Sum", value: currency(data.job.contractValue) },
    { label: "Net Change by Change Orders", value: currency(netChangeOrders) },
    { label: "Contract Sum to Date", value: currency(contractSumToDate), fill: SUMMARY_HIGHLIGHT },
    { label: "Total Completed & Stored to Date", value: currency(totals.totalCompleted) },
    { label: "Retainage", value: currency(totals.retention), fill: SUMMARY_HIGHLIGHT },
    { label: "Total Earned Less Retainage", value: currency(totalEarnedLessRetainage), fill: SUMMARY_HIGHLIGHT },
    { label: "Balance to Finish", value: currency(totals.balanceToFinish), fill: SUMMARY_FINAL },
  ];

  autoTable(doc, {
    startY,
    margin: { left: MARGIN },
    body: summaryRows.map((row) => [row.label, row.value]),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 3.5, bottom: 3.5, left: 8, right: 8 },
      textColor: "#000000",
      lineColor: BORDER,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: labelColWidth, halign: "left" },
      1: { cellWidth: valueColWidth, halign: "right" },
    },
    tableWidth,
    didParseCell: (cellData) => {
      const fill = summaryRows[cellData.row.index]?.fill;
      if (fill) {
        cellData.cell.styles.fillColor = fill;
      }
    },
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
}

function drawSOVScope(doc: jsPDF, data: PayAppPdfData, startY: number) {
  const SECTION_GAP = 8;
  let y = drawSectionHeading(doc, "Contract Line Items", startY);
  y = drawLineItemsTable(doc, data.lineItems, data.cwRate, data.smRate, y);

  y = drawSectionHeading(doc, "Change Orders", y + SECTION_GAP);
  y = drawLineItemsTable(doc, data.changeOrders, data.cwRate, data.smRate, y);

  y = drawSectionHeading(doc, "Application Summary", y + SECTION_GAP);
  y = drawApplicationSummary(doc, data, y);

  return y;
}

function drawWrappedText(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight: number) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawFieldLine(doc: jsPDF, label: string, x: number, y: number, width: number, value?: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(LABEL_GRAY);
  doc.text(label, x, y);
  const labelWidth = doc.getTextWidth(`${label} `);
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(x + labelWidth, y + 1.5, x + width, y + 1.5);
  if (value) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#000000");
    doc.text(value, x + labelWidth + 3, y);
  }
}

function drawSignatureImage(doc: jsPDF, dataUrl: string, x: number, y: number, maxWidth: number) {
  const imgHeight = 32;
  const imgWidth = Math.min(maxWidth, 140);
  doc.addImage(dataUrl, "PNG", x, y - imgHeight + 4, imgWidth, imgHeight);
}

function drawG702Scope(doc: jsPDF, data: PayAppPdfData, startY: number) {
  const allLines = [...data.lineItems, ...data.changeOrders];
  const computed = allLines.map((line) => computeLine(line, data.cwRate, data.smRate));
  const totals = sumLines(computed);

  const netChangeOrders = data.changeOrders.reduce((sum, co) => sum + co.scheduledValue, 0);
  const contractSumToDate = data.job.contractValue + netChangeOrders;
  const retentionCW = data.cwRate * allLines.reduce((sum, line) => sum + line.previousApplications + line.thisPeriod, 0);
  const retentionSM = data.smRate * allLines.reduce((sum, line) => sum + line.storedMaterials, 0);
  const totalEarnedLessRetainage = totals.totalCompleted - totals.retention;
  const prevCertificates = previousCertificates(allLines, data.cwRate);
  const currentPaymentDue = totalEarnedLessRetainage - prevCertificates;
  const balanceToFinishIncRetainage = contractSumToDate - totals.totalCompleted;

  const leftX = MARGIN;
  const leftWidth = 430;
  const rightX = MARGIN + leftWidth + 20;
  const rightWidth = doc.internal.pageSize.getWidth() - MARGIN - rightX;

  // ---- Left column: certification statement + numbered summary + change order summary ----
  let leftY = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(NAVY);
  doc.text("SUBCONTRACTOR'S APPLICATION FOR PAYMENT", leftX, leftY);
  leftY += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(LABEL_GRAY);
  doc.text("Application is made for payment, as shown below, in accordance with the Contract.", leftX, leftY);
  leftY += 11;
  doc.text("Continuation Sheet, Document G703, is attached.", leftX, leftY);
  leftY += 10;

  const cwPercent = `${(data.cwRate * 100).toFixed(0)}%`;
  const smPercent = `${(data.smRate * 100).toFixed(0)}%`;

  const summaryRows: { label: string; value: string; fill?: string; emphasize?: boolean }[] = [
    { label: "1. Original Subcontract Sum", value: currency(data.job.contractValue) },
    { label: "2. Net Change By Change Orders", value: currency(netChangeOrders) },
    { label: "3. Subcontract Sum to Date (Line 1+2)", value: currency(contractSumToDate), fill: SUMMARY_HIGHLIGHT },
    { label: "4. Total complete & Stored To Date (Column G on G703)", value: currency(totals.totalCompleted) },
    { label: `5a. Retainage ${cwPercent} of Completed Work (Column D + E on G703)`, value: currency(retentionCW) },
    { label: `5b. Retainage ${smPercent} of Stored Material (Column F on G703)`, value: currency(retentionSM) },
    { label: "Total Retainage (Lines 5a + 5b, or Total in Column I of G703)", value: currency(totals.retention), fill: SUMMARY_HIGHLIGHT },
    { label: "6. Total Earned Less Retainage (Line 4 less Line 5 Total)", value: currency(totalEarnedLessRetainage) },
    { label: "7. Less Previous Certificates For Payment (Line 6 from prior Certificate)", value: currency(prevCertificates) },
    { label: "8. Current Payment Due", value: currency(currentPaymentDue), fill: SUMMARY_FINAL, emphasize: true },
    { label: "9. Balance To Finish, Including Retainage (Line 3 less Line 6)", value: currency(balanceToFinishIncRetainage) },
  ];

  autoTable(doc, {
    startY: leftY,
    margin: { left: leftX },
    body: summaryRows.map((row) => [row.label, row.value]),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 8, right: 8 },
      textColor: "#000000",
      lineColor: BORDER,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 300, halign: "left" },
      1: { cellWidth: 130, halign: "right" },
    },
    tableWidth: leftWidth,
    didParseCell: (cellData) => {
      const row = summaryRows[cellData.row.index];
      if (row?.fill) {
        cellData.cell.styles.fillColor = row.fill;
      }
      if (row?.emphasize) {
        cellData.cell.styles.fontSize = 10;
      }
    },
  });

  leftY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(NAVY);
  doc.text("CHANGE ORDER SUMMARY", leftX, leftY);
  leftY += 12;

  const previousChangeOrders = 0;
  const approvedThisMonth = netChangeOrders - previousChangeOrders;
  const additions = data.changeOrders.filter((co) => co.scheduledValue >= 0).reduce((sum, co) => sum + co.scheduledValue, 0);
  const deductions = data.changeOrders.filter((co) => co.scheduledValue < 0).reduce((sum, co) => sum + -co.scheduledValue, 0);

  const changeOrderRows: { label: string; additions: string; deductions: string; fill?: string; isHeader?: boolean }[] = [
    { label: "", additions: "ADDITIONS", deductions: "DEDUCTIONS", isHeader: true },
    { label: "Total changes approved in previous months by Owner", additions: currency(previousChangeOrders), deductions: currency(0) },
    { label: "Total Approved this Month", additions: currency(additions), deductions: currency(deductions) },
    { label: "TOTAL", additions: currency(previousChangeOrders + additions), deductions: currency(deductions), fill: SUMMARY_HIGHLIGHT },
    { label: "NET CHANGES by Change Order", additions: currency(netChangeOrders), deductions: "", fill: SUMMARY_HIGHLIGHT },
  ];

  autoTable(doc, {
    startY: leftY,
    margin: { left: leftX },
    body: changeOrderRows.map((row) => [row.label, row.additions, row.deductions]),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 8, right: 8 },
      textColor: "#000000",
      lineColor: BORDER,
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 230, halign: "left" },
      1: { cellWidth: 100, halign: "right" },
      2: { cellWidth: 100, halign: "right" },
    },
    tableWidth: leftWidth,
    didParseCell: (cellData) => {
      const row = changeOrderRows[cellData.row.index];
      if (row?.fill) {
        cellData.cell.styles.fillColor = row.fill;
      }
      if (row?.isHeader) {
        cellData.cell.styles.fontStyle = "bolditalic";
      }
    },
  });

  const leftFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ---- Right column: contractor signature/notary + architect's certificate ----
  let rightY = startY;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(LABEL_GRAY);
  rightY = drawWrappedText(
    doc,
    "The undersigned Subcontractor certifies that to the best of the Subcontractor's knowledge, information and belief, the Work covered by this Application for Payment has been completed in accordance with the Contract Documents, that all amounts have been paid for Work for which previous Certificates for Payment were issued and payments received from the Contractor, and that current payment shown herein is now due.",
    rightX,
    rightY,
    rightWidth,
    8.5
  );
  rightY += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(NAVY);
  doc.text("SUBCONTRACTOR:", rightX, rightY);
  rightY += 36;

  drawFieldLine(doc, "By:", rightX, rightY, rightWidth * 0.6);
  if (data.signatureDataUrl) {
    drawSignatureImage(doc, data.signatureDataUrl, rightX + 14, rightY, rightWidth * 0.6 - 14);
  }
  drawFieldLine(doc, "Date:", rightX + rightWidth * 0.65, rightY, rightWidth * 0.35, formatDate(data.applicationDate));
  rightY += 16;

  rightY += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(NAVY);
  doc.text("CERTIFICATE FOR PAYMENT", rightX, rightY);
  rightY += 11;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(LABEL_GRAY);
  rightY = drawWrappedText(
    doc,
    "In accordance with the Contract Documents, based on on-site observations and the data comprising the above application, the Construction Manager certifies that to the best of his knowledge, information and belief the Work has progressed as indicated, the quality of the Work is in accordance with the Contract Documents, and the Contractor is entitled to payment of the",
    rightX,
    rightY,
    rightWidth,
    8.5
  );
  rightY += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor("#000000");
  doc.text("AMOUNT CERTIFIED.", rightX, rightY);
  rightY += 10;

  doc.setFillColor(SUMMARY_FINAL);
  doc.rect(rightX, rightY - 9, rightWidth, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor("#000000");
  doc.text("AMOUNT CERTIFIED:", rightX + 6, rightY + 4);
  doc.setFontSize(10);
  doc.text(currency(currentPaymentDue), rightX + rightWidth - 6, rightY + 4, { align: "right" });
  rightY += 18;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(SUBTITLE_GRAY);
  rightY = drawWrappedText(
    doc,
    "(Attach explanation if amount certified differs from the amount applied for. Initial all figures on this Application and on the Continuation Sheet that changed to conform to the amount certified.)",
    rightX,
    rightY,
    rightWidth,
    8
  );
  rightY += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(NAVY);
  doc.text("ARCHITECT:", rightX, rightY);
  rightY += 14;

  drawFieldLine(doc, "By:", rightX, rightY, rightWidth * 0.6);
  drawFieldLine(doc, "Date:", rightX + rightWidth * 0.65, rightY, rightWidth * 0.35);
  rightY += 12;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(SUBTITLE_GRAY);
  rightY = drawWrappedText(
    doc,
    "This certificate is not negotiable. The AMOUNT CERTIFIED is payable only to the Contractor named herein. Issuance, payment and acceptance of payment are without prejudice to any rights of the Owner or Contractor under this Contract.",
    rightX,
    rightY,
    rightWidth,
    8
  );

  return Math.max(leftFinalY, rightY) + 16;
}

export function buildPayApplicationDoc(data: PayAppPdfData, scope: PdfScope = "sov") {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });

  const titleByScope: Record<PdfScope, string> = {
    sov: "Schedule of Values",
    g702: "Application & Certificate for Payment",
    packet: "Pay Application Packet",
  };
  const subtitleByScope: Record<PdfScope, string> = {
    sov: "AIA Document G703 — Continuation Sheet",
    g702: "AIA Document G702 — Application & Certificate for Payment",
    packet: "Pay Application Packet",
  };

  let y =
    scope === "g702"
      ? drawG702Header(doc, data, titleByScope[scope], subtitleByScope[scope])
      : drawTitleAndInfo(doc, data, titleByScope[scope], subtitleByScope[scope]);

  if (scope === "sov" || scope === "packet") {
    y = drawSOVScope(doc, data, y);
  }

  if (scope === "g702" || scope === "packet") {
    y = drawG702Scope(doc, data, y);
  }

  return doc;
}

export function exportPayApplicationPdf(data: PayAppPdfData, scope: PdfScope = "sov") {
  const doc = buildPayApplicationDoc(data, scope);

  const filenameByScope: Record<PdfScope, string> = {
    sov: "sov",
    g702: "g702",
    packet: "pay-application",
  };

  doc.save(`${data.job.jobNumber}-${filenameByScope[scope]}-app${data.applicationNumber || "1"}.pdf`);
}
