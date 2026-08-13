// Generates the blank "Job Import" Excel template that subcontractor teams
// fill out and upload via Job Setup → Job Import.
//
// Two sheets:
//  - "JOB INFO": every field on the Syntriq Job Setup form.
//  - "SCHEDULE OF VALUES": a line-item table for the job's SOV breakout.
//
// The cell/row addresses below are load-bearing: src/lib/yellowcard/parse.ts
// reads specific cells by address. If you move something here, update
// parse.ts to match — or the import will silently read blanks.
//
// Run: node scripts/generate-job-import-template.mjs

import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const NAVY = "0F334B";
const TEAL = "1D8F96";
const LIGHT_TEAL = "E7F4F5";
const WHITE = "FFFFFF";
const LABEL_GRAY = "44546A";
const INPUT_FILL = "FFFDE7";
const BORDER = { style: "thin", color: { argb: "FFD9DEE4" } };

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(repoRoot, "public", "templates", "syntriq-job-import-template.xlsx");
// A small pre-resized copy — embedding the full 1024×1024 source logo would
// bloat this file to 600+ KB even though it only ever displays at 22×22px.
// Regenerate with: sips -z 128 128 public/SyntriqLogo2.png --out scripts/assets/syntriq-logo-small.png
const logoPath = path.join(repoRoot, "scripts", "assets", "syntriq-logo-small.png");

const wb = new ExcelJS.Workbook();
wb.creator = "Syntriq";
wb.created = new Date();

const logoImageId = wb.addImage({
  buffer: readFileSync(logoPath),
  extension: "png",
});

function banner(ws, row, span, title, subtitle) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = title;
  c.font = { name: "Calibri", size: 15, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 8 };
  ws.getRow(row).height = 38;
  for (let col = 1; col <= span; col++) ws.getCell(row, col).fill = c.fill;

  ws.addImage(logoImageId, {
    tl: { col: 0.12, row: row - 1 + 0.15 },
    ext: { width: 36, height: 36 },
    editAs: "oneCell",
  });

  const sr = row + 1;
  ws.mergeCells(sr, 1, sr, span);
  const sc = ws.getCell(sr, 1);
  sc.value = subtitle;
  sc.font = { name: "Calibri", size: 10, italic: true, color: { argb: LABEL_GRAY } };
  sc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(sr).height = 18;
}

function sectionHeader(ws, row, startCol, endCol, text) {
  ws.mergeCells(row, startCol, row, endCol);
  const c = ws.getCell(row, startCol);
  c.value = text;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: TEAL } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_TEAL } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 17;
  for (let col = startCol; col <= endCol; col++) ws.getCell(row, col).fill = c.fill;
}

// Writes a label in `labelCol` and a fillable, merged input cell starting
// at `valueCol` spanning `span` columns, both on `row`.
function field(ws, row, labelCol, labelText, valueCol, span, opts = {}) {
  const lc = ws.getCell(row, labelCol);
  lc.value = labelText;
  lc.font = { name: "Calibri", size: 10, bold: true, color: { argb: LABEL_GRAY } };
  lc.alignment = { vertical: "middle", horizontal: "left" };

  if (span > 1) ws.mergeCells(row, valueCol, row, valueCol + span - 1);
  const vc = ws.getCell(row, valueCol);
  vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
  vc.font = { name: "Calibri", size: 10, color: { argb: NAVY } };
  vc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  if (opts.numFmt) vc.numFmt = opts.numFmt;
  if (opts.defaultValue !== undefined) vc.value = opts.defaultValue;
  if (opts.list) {
    vc.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${opts.list.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid entry",
      error: `Please choose one of: ${opts.list.join(", ")}`,
    };
  }
  for (let col = valueCol; col <= valueCol + span - 1; col++) {
    ws.getCell(row, col).border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  }
  ws.getRow(row).height = 19;
}

function footerNote(ws, row, span, text) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: "Calibri", size: 9, italic: true, color: { argb: LABEL_GRAY } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  ws.getRow(row).height = 28;
}

// ══════════════════════════════════════════════════════════════════════════
// Sheet 1: JOB INFO
// ══════════════════════════════════════════════════════════════════════════
const ji = wb.addWorksheet("JOB INFO", {
  views: [{ showGridLines: false }],
  pageSetup: {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
  },
});

ji.columns = [
  { width: 3 },  // A
  { width: 3 },  // B
  { width: 3 },  // C
  { width: 24 }, // D label
  { width: 15 }, // E value
  { width: 15 }, // F value (merge)
  { width: 15 }, // G value (merge)
  { width: 4 },  // H spacer
  { width: 3 },  // I
  { width: 3 },  // J
  { width: 3 },  // K
  { width: 26 }, // L label
  { width: 15 }, // M value
  { width: 15 }, // N value (merge)
  { width: 15 }, // O value (merge)
];

banner(
  ji,
  1,
  15,
  "SYNTRIQ — Job Import Template",
  "Sheet 1 of 2: JOB INFO   ·   Fill in the shaded cells only, then save and upload via Job Setup → Job Import."
);

// ── Left column ──────────────────────────────────────────────────────────
sectionHeader(ji, 5, 4, 7, "PROJECT & SITE");
field(ji, 6, 4, "Job Name", 5, 3);
field(ji, 7, 4, "Job #", 5, 3);
field(ji, 8, 4, "GC Project #", 5, 3);
field(ji, 9, 4, "Job / Site Address", 5, 3);

sectionHeader(ji, 11, 4, 7, "GENERAL CONTRACTOR");
field(ji, 12, 4, "Customer (GC) Name", 5, 3);
field(ji, 13, 4, "Customer Billing Address", 5, 3);

sectionHeader(ji, 15, 4, 7, "OWNER & ARCHITECT");
field(ji, 16, 4, "Owner", 5, 3);
field(ji, 17, 4, "Owner Address", 5, 3);
field(ji, 18, 4, "Architect", 5, 3);

// ── Right column ─────────────────────────────────────────────────────────
sectionHeader(ji, 5, 12, 15, "CONTRACT");
field(ji, 6, 12, "Contract For (Scope of Work)", 13, 3);
field(ji, 7, 12, "Contract Value", 13, 3, { numFmt: '"$"#,##0.00' });
field(ji, 8, 12, "Contract Date", 13, 3, { numFmt: "m/d/yyyy" });
field(ji, 9, 12, "Start Date", 13, 3, { numFmt: "m/d/yyyy" });

sectionHeader(ji, 11, 12, 15, "RETENTION");
field(ji, 12, 12, "Retention — Completed Work (%)", 13, 3, { numFmt: '0.00"%"' });
field(ji, 13, 12, "Retention — Stored Materials (%)", 13, 3, { numFmt: '0.00"%"' });

sectionHeader(ji, 15, 12, 15, "BILLING & TEAM");
field(ji, 16, 12, "Project Manager", 13, 3);
field(ji, 17, 12, "Certified Payroll Job?", 13, 3, { list: ["Yes", "No"], defaultValue: "No" });
field(ji, 18, 12, "Payment Terms", 13, 3);
field(ji, 19, 12, "Billing Due Day (1–28)", 13, 3, { numFmt: "0" });
field(ji, 20, 12, "Next Billing Check-in Month (YYYY-MM)", 13, 3);
field(ji, 21, 12, "Billing Platform", 13, 3);

footerNote(
  ji,
  23,
  15,
  "Every shaded cell above maps to a specific field in Syntriq — please don't insert or delete rows/columns, or move cells around, or the import won't read correctly. See the SCHEDULE OF VALUES tab to list your billable line items."
);

// ══════════════════════════════════════════════════════════════════════════
// Sheet 2: SCHEDULE OF VALUES
// ══════════════════════════════════════════════════════════════════════════
const sov = wb.addWorksheet("SCHEDULE OF VALUES", {
  views: [{ showGridLines: false }],
  pageSetup: {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
  },
});

sov.columns = [
  { width: 3 },  // A margin
  { width: 12 }, // B Item #
  { width: 58 }, // C Description
  { width: 20 }, // D Scheduled Value
  { width: 3 },  // E margin
];

banner(
  sov,
  1,
  4,
  "SYNTRIQ — Job Import Template",
  "Sheet 2 of 2: SCHEDULE OF VALUES   ·   List each billable line item, then save and upload via Job Setup → Job Import."
);

const SOV_HEADER_ROW = 4;
const SOV_FIRST_DATA_ROW = 5;
const SOV_LAST_DATA_ROW = 54; // 50 blank rows to fill in
const SOV_TOTAL_ROW = SOV_LAST_DATA_ROW + 1;

["Item #", "Description", "Scheduled Value"].forEach((text, i) => {
  const c = sov.getCell(SOV_HEADER_ROW, 2 + i);
  c.value = text;
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  c.alignment = { vertical: "middle", horizontal: i === 2 ? "right" : "left", indent: 1 };
});
sov.getRow(SOV_HEADER_ROW).height = 20;

for (let row = SOV_FIRST_DATA_ROW; row <= SOV_LAST_DATA_ROW; row++) {
  for (let col = 2; col <= 4; col++) {
    const c = sov.getCell(row, col);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
    c.font = { name: "Calibri", size: 10, color: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: col === 4 ? "right" : "left", indent: 1 };
    c.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    if (col === 4) c.numFmt = '"$"#,##0.00';
  }
  sov.getRow(row).height = 18;
}

const totalLabel = sov.getCell(SOV_TOTAL_ROW, 2);
sov.mergeCells(SOV_TOTAL_ROW, 2, SOV_TOTAL_ROW, 3);
totalLabel.value = "TOTAL";
totalLabel.font = { name: "Calibri", size: 10, bold: true, color: { argb: NAVY } };
totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_TEAL } };
totalLabel.alignment = { vertical: "middle", horizontal: "right", indent: 1 };

const totalValue = sov.getCell(SOV_TOTAL_ROW, 4);
totalValue.value = { formula: `SUM(D${SOV_FIRST_DATA_ROW}:D${SOV_LAST_DATA_ROW})` };
totalValue.font = { name: "Calibri", size: 10, bold: true, color: { argb: NAVY } };
totalValue.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_TEAL } };
totalValue.numFmt = '"$"#,##0.00';
totalValue.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
totalValue.border = { top: { style: "double", color: { argb: "FF44546A" } } };
sov.getRow(SOV_TOTAL_ROW).height = 20;

footerNote(
  sov,
  SOV_TOTAL_ROW + 2,
  4,
  "Leave Item # blank to have Syntriq number the rows automatically. Leave a row entirely blank to skip it. The Scheduled Value total shouldn't exceed the Contract Value entered on the JOB INFO tab."
);

await wb.xlsx.writeFile(outPath);
console.log(`Wrote ${outPath}`);
