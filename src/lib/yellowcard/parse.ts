import * as XLSX from "xlsx";
import { cleanString, cleanDate, cleanNumber, cleanPercent } from "./clean";
import type { JobSetup } from "@/lib/jobSetupData";

export type ImportedSovLine = {
  item: string;
  description: string;
  scheduledValue: number;
};

export type ParseResult = {
  draftJob: JobSetup;
  sovLineItems: ImportedSovLine[];
  warnings: string[];
};

const SOV_FIRST_DATA_ROW = 5;
const SOV_LAST_DATA_ROW = 54;

type Cell = XLSX.CellObject;

function get(sheet: XLSX.WorkSheet, addr: string): Cell | undefined {
  return sheet[addr] as Cell | undefined;
}

function str(sheet: XLSX.WorkSheet, addr: string): string {
  const c = get(sheet, addr);
  if (!c) return "";
  // Prefer the formatted text Excel shows (c.w) over the raw value for strings
  return cleanString(c.t === "s" ? (c.w ?? c.v) : (c.w ?? c.v));
}

function num(sheet: XLSX.WorkSheet, addr: string): number {
  const c = get(sheet, addr);
  return c ? cleanNumber(c.v) : 0;
}

function pct(sheet: XLSX.WorkSheet, addr: string): number {
  const c = get(sheet, addr);
  return c ? cleanPercent(c.v) : 0;
}

function date(sheet: XLSX.WorkSheet, addr: string): string {
  const c = get(sheet, addr);
  return c ? cleanDate(c.v) : "";
}

function bool(sheet: XLSX.WorkSheet, addr: string): boolean {
  return str(sheet, addr).trim().toLowerCase() === "yes";
}

export function parseYellowcard(buffer: Buffer): ParseResult {
  const warnings: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new Error(
      "Could not read this file. Common causes: (1) the file is not .xlsx format — older .xls files must be resaved as .xlsx first; (2) the workbook is password-protected — remove the password before uploading; (3) the file is corrupted or not a Syntriq Job Import template."
    );
  }

  const sheet = wb.Sheets["JOB INFO"];
  if (!sheet) {
    throw new Error('Sheet "JOB INFO" not found — is this the Syntriq Job Import template?');
  }

  // ── Project & site ───────────────────────────────────────────────────────
  const jobName                = str(sheet, "E6");
  const jobNumber               = str(sheet, "E7");
  const architectProjectNumber = str(sheet, "E8");
  const jobAddress              = str(sheet, "E9");

  // ── General contractor ───────────────────────────────────────────────────
  const customer        = str(sheet, "E12");
  const customerAddress = str(sheet, "E13");

  // ── Owner & architect ────────────────────────────────────────────────────
  const owner        = str(sheet, "E16");
  const ownerAddress = str(sheet, "E17");
  const architect    = str(sheet, "E18");

  // ── Contract ──────────────────────────────────────────────────────────────
  const contractFor   = str(sheet, "M6");
  const contractValue = num(sheet, "M7");
  const contractDate  = date(sheet, "M8");
  const startDate     = date(sheet, "M9");

  // ── Retention ─────────────────────────────────────────────────────────────
  const retentionRateCW = pct(sheet, "M12");
  const retentionRateSM = pct(sheet, "M13");

  // ── Billing & team ────────────────────────────────────────────────────────
  const ctiPm             = str(sheet, "M16");
  const certifiedPayroll  = bool(sheet, "M17");
  const paymentTerms      = str(sheet, "M18");
  const billingDueDay     = num(sheet, "M19");
  const billingCheckinMonth = str(sheet, "M20");
  const billingPlatform   = str(sheet, "M21");

  // ── Flag gaps in required fields ─────────────────────────────────────────
  if (!jobName)          warnings.push("Job Name not found — enter it manually.");
  if (!jobNumber)        warnings.push("Job # not found — enter it manually.");
  if (!jobAddress)       warnings.push("Job / site address not found — enter it manually.");
  if (!customer)         warnings.push("Customer (GC) name not found — enter it manually.");
  if (!customerAddress)  warnings.push("Customer billing address not found — enter it manually.");
  if (!contractFor)      warnings.push("Contract for (scope of work) not found — enter it manually.");
  if (contractValue === 0) warnings.push("Contract value not found — enter it manually.");
  if (!contractDate)     warnings.push("Contract date not found — enter it manually.");
  if (retentionRateCW === 0) warnings.push("Retention — completed work (%) not found — enter it manually.");
  if (retentionRateSM === 0) warnings.push("Retention — stored materials (%) not found — enter it manually.");
  if (!ctiPm)             warnings.push("Project manager not found — enter it manually.");
  if (billingDueDay === 0) warnings.push("Billing due day not found — enter it manually.");
  if (!billingPlatform)  warnings.push("Billing platform not found — enter it manually.");

  // ── Schedule of values ───────────────────────────────────────────────────
  const sovSheet = wb.Sheets["SCHEDULE OF VALUES"];
  const sovLineItems: ImportedSovLine[] = [];
  if (sovSheet) {
    for (let row = SOV_FIRST_DATA_ROW; row <= SOV_LAST_DATA_ROW; row++) {
      const item = str(sovSheet, `B${row}`);
      const description = str(sovSheet, `C${row}`);
      const scheduledValue = num(sovSheet, `D${row}`);
      if (!description && scheduledValue === 0) continue; // skip blank rows
      sovLineItems.push({
        item: item || String(sovLineItems.length + 1),
        description,
        scheduledValue,
      });
    }
  }

  const draftJob: JobSetup = {
    jobName,
    jobNumber,
    customer,
    customerAddress,
    gcId: null,
    paymentTerms,
    owner,
    ownerAddress,
    jobAddress,
    architect,
    architectAddress: "",
    architectProjectNumber,
    contractFor,
    contractValue,
    contractDate,
    startDate,
    retentionRateCW,
    retentionRateSM,
    ctiPm,
    retentionStepdownThreshold: null,
    retentionStepdownRateCW: null,
    billingDueDay,
    billingCheckinMonth,
    billingPlatform,
    certifiedPayroll,
  };

  return { draftJob, sovLineItems, warnings };
}
