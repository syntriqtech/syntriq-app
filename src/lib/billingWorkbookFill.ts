import ExcelJS from "exceljs";
import { SOVLineItem } from "@/lib/sovData";

// Shape of billing_form_templates.field_mapping (supabase/064). Two parts,
// because scalar header fields and the repeating SOV line rows need
// different shapes — see chat/plan for the full CTI mapping this resolves.
export type BillingWorkbookMapping = {
  fields: Record<string, Record<string, string>>; // sheet name -> cell ref -> dotted data key
  lineItemBlocks: {
    sheet: string;
    // "contractAndChangeOrders" is for single-list forms (e.g. Cahill's) that
    // put change orders right after the contract lines in the same table.
    source: "contractLines" | "changeOrders" | "contractAndChangeOrders";
    startRow: number;
    endRow: number;
    columns: Record<string, string>; // "item" | "description" | "scheduledValue" | "previousApplications" | "currentApplication" | "storedMaterials" | "percentComplete" | "paidRetention" -> column letter
  }[];
};

export type BillingWorkbookData = {
  gc: {
    name: string;
    projectNumber: string;
    street: string;
    cityStateZip: string;
    phone: string;
    fax: string;
    pmName: string;
    email: string;
    pmMobile: string;
  };
  job: {
    name: string;
    jobNumber: string;
    poNumber: string;
    street: string;
    cityStateZip: string;
    contractValue: number;
    ohAndPPct: number | null;
    ctiPmName: string;
    retentionRateCW: number;
    contractRetentionPctPrevious: number | null;
    coRetentionPct: number | null;
    coRetentionPctPrevious: number | null;
    ownerName: string;
  };
  company: {
    contactEmail: string;
    contactPhone: string;
  };
  payApp: {
    applicationNumber: string;
    invoiceNumber: string; // "{jobNumber}-{applicationNumber}", same as the COBE form's Invoice #
    applicationDate: string; // ISO yyyy-mm-dd
    periodTo: string; // ISO yyyy-mm-dd
  };
  contractLines: SOVLineItem[];
  changeOrders: SOVLineItem[];
};

// Fields stored as e.g. 10 meaning 10% (matching retention_rate_cw's
// existing convention throughout this codebase) — divided by 100 here so
// the workbook's own percent-formatted cells display correctly.
const PERCENT_KEYS = new Set([
  "job.retentionRateCW",
  "job.contractRetentionPctPrevious",
  "job.coRetentionPct",
  "job.coRetentionPctPrevious",
  "job.ohAndPPct",
]);

const DATE_KEYS = new Set(["payApp.applicationDate", "payApp.periodTo"]);

function resolvePath(data: BillingWorkbookData, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}

function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  // UTC midnight, because exceljs converts Dates to Excel's date serial in UTC —
  // a local-midnight Date would land on the wrong day for any timezone east of UTC.
  return new Date(Date.UTC(y, m - 1, d));
}

function resolveCellValue(data: BillingWorkbookData, key: string): string | number | Date | null {
  // A key containing {braces} is a text template, e.g. "PROJECT NAME: {job.name}"
  // — for cells where the form prints a label and the value in one cell.
  if (key.includes("{")) {
    return key.replace(/\{([^}]+)\}/g, (_, path: string) => String(resolvePath(data, path) ?? ""));
  }
  const raw = resolvePath(data, key);
  if (DATE_KEYS.has(key)) return parseIsoDate(String(raw ?? ""));
  if (raw == null) return null;
  if (PERCENT_KEYS.has(key)) return Number(raw) / 100;
  return raw as string | number;
}

function lineWorkbookPercent(line: SOVLineItem): number {
  // Cumulative % complete EXCLUDING stored materials — matches the
  // workbook's own formula (F = %*ScheduledValue - Previous, with Stored
  // Materials added separately via H = SUM(E:G)), verified against the
  // real template. Not the same as payAppMath's percentComplete, which
  // includes stored materials.
  if (!line.scheduledValue) return 0;
  return (line.previousApplications + line.thisPeriod) / line.scheduledValue;
}

function lineColumnValue(line: SOVLineItem, field: string): string | number {
  switch (field) {
    case "item":
      return line.item;
    case "description":
      return line.description;
    case "scheduledValue":
      return line.scheduledValue;
    case "previousApplications":
      return line.previousApplications;
    case "currentApplication":
      // For forms with no separate Stored Materials column: what's billed
      // this invoice is this period's work plus any stored materials.
      return line.thisPeriod + line.storedMaterials;
    case "storedMaterials":
      return line.storedMaterials;
    case "percentComplete":
      return lineWorkbookPercent(line);
    case "paidRetention":
      // No Syntriq field for retention already released tracks this yet
      // (see retention_releases, out of scope here) — 0 matches the
      // template's own documented default for this manual-override column.
      return 0;
    default:
      throw new Error(`Unknown line item column mapping: "${field}"`);
  }
}

export async function fillBillingWorkbook(
  templateBuffer: ArrayBuffer,
  mapping: BillingWorkbookMapping,
  data: BillingWorkbookData
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's TS types are Node-Buffer-centric, but its "browser" build
  // (resolved automatically here via its package.json browser field) reads
  // and writes plain ArrayBuffer/Uint8Array — hence the casts at these two
  // boundary calls only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(templateBuffer as any);

  for (const [sheetName, cells] of Object.entries(mapping.fields)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`Template is missing expected sheet "${sheetName}".`);
    for (const [cellRef, dataKey] of Object.entries(cells)) {
      sheet.getCell(cellRef).value = resolveCellValue(data, dataKey);
    }
  }

  for (const block of mapping.lineItemBlocks) {
    const sheet = workbook.getWorksheet(block.sheet);
    if (!sheet) throw new Error(`Template is missing expected sheet "${block.sheet}".`);
    const lines = block.source === "contractAndChangeOrders" ? [...data.contractLines, ...data.changeOrders] : data[block.source];
    const capacity = block.endRow - block.startRow + 1;
    if (lines.length > capacity) {
      throw new Error(
        `${block.source === "contractLines" ? "Contract" : block.source === "changeOrders" ? "Change order" : "Contract and change order"} line items (${lines.length}) don't fit ` +
          `the template's ${capacity} available rows (${block.sheet} rows ${block.startRow}-${block.endRow}). ` +
          `Combine lines or extend the template before generating.`
      );
    }
    lines.forEach((line, i) => {
      const row = block.startRow + i;
      for (const [field, col] of Object.entries(block.columns)) {
        sheet.getCell(`${col}${row}`).value = lineColumnValue(line, field);
      }
    });
  }

  // Tell Excel to recompute every formula when the file opens, so the
  // template's own totals never show stale numbers from before the fill.
  workbook.calcProperties.fullCalcOnLoad = true;

  const output = await workbook.xlsx.writeBuffer();
  return output as unknown as ArrayBuffer;
}
