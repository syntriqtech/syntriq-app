import * as XLSX from "xlsx";
import { cleanString, cleanPhone, cleanDate, cleanNumber, cleanPercent } from "./clean";
import type { JobSetup } from "@/lib/jobSetupData";

export type YellowcardExtras = {
  gcPhone: string;
  gcPmName: string;
  gcPmEmail: string;
  ctiPmName: string;
  ctiEmail: string;
  ctiPhone: string;
  estimator: string;
  county: string;
  ohAndPPercent: number;
  changeOrderRatePercent: number;
  ownerContact: string;
  ownerPhone: string;
  poNumber: string;
  projectMgrName: string;
};

export type ParseResult = {
  draftJob: Omit<JobSetup, "contractValue" | "jobName"> & { jobName: string };
  warnings: string[];
  originalContract: number;
  tileScopeValue: number;
  extras: YellowcardExtras;
};

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

function phone(sheet: XLSX.WorkSheet, addr: string): string {
  const c = get(sheet, addr);
  return c ? cleanPhone({ v: c.v, w: c.w }) : "";
}

export function parseYellowcard(buffer: Buffer): ParseResult {
  const warnings: string[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new Error(
      "Could not read this file. Common causes: (1) the file is not .xlsx format — older .xls files must be resaved as .xlsx first; (2) the workbook is password-protected — remove the password before uploading; (3) the file is corrupted or not a Yellowcard at all."
    );
  }

  const ji = wb.Sheets["JOB INFO"];
  const yc = wb.Sheets["YELLOW CARD"];

  if (!ji) warnings.push('Sheet "JOB INFO" not found — GC and job fields will be blank.');
  if (!yc) warnings.push('Sheet "YELLOW CARD" not found — owner, retention, and date fields will be blank.');

  // ── JOB INFO sheet ─────────────────────────────────────────────────────────
  const gcName        = ji ? str(ji, "E6") : "";
  const gcProject     = ji ? str(ji, "E7") : "";
  const gcStreet      = ji ? str(ji, "E8") : "";
  const gcCity        = ji ? str(ji, "E9") : "";
  const gcPhone       = ji ? phone(ji, "E10") : "";
  const gcPmName      = ji ? str(ji, "E12") : "";
  const gcPmEmail     = ji ? str(ji, "E13") : "";
  const jobName       = ji ? str(ji, "M6") : "";
  const poNumber      = ji ? str(ji, "M7") : "";
  const jobStreet     = ji ? str(ji, "M8") : "";
  const jobCity       = ji ? str(ji, "M9") : "";
  const originalContract = ji ? num(ji, "M10") : 0;
  const ohAndPPercent = ji ? pct(ji, "M11") : 0;
  const ctiPmName     = ji ? str(ji, "M12") : "";
  const ctiEmail      = ji ? str(ji, "M13") : "";
  const ctiPhone      = ji ? phone(ji, "M14") : "";

  // ── YELLOW CARD sheet ──────────────────────────────────────────────────────
  const retention          = yc ? num(yc, "F1") : 0;
  const awardDate          = yc ? date(yc, "K13") : "";
  const ownerName          = yc ? str(yc, "C16") : "";
  const ownerStreet        = yc ? str(yc, "C17") : "";
  const ownerCityStateZip  = yc ? str(yc, "C18") : "";
  const ownerPhone         = yc ? phone(yc, "C19") : "";
  const ownerContact       = yc ? str(yc, "C20") : "";
  const estimator          = yc ? str(yc, "L23") : "";
  const projectMgr         = yc ? str(yc, "L24") : "";
  const county             = yc ? str(yc, "L25") : "";
  const tileScopeValue     = yc ? num(yc, "C35") : 0;
  const changeOrderRatePercent = yc ? pct(yc, "C39") : 0;

  // ── Cross-check redundant fields ───────────────────────────────────────────
  if (ctiPmName && projectMgr && ctiPmName !== projectMgr) {
    warnings.push(
      `CTI PM name differs between sheets ("${ctiPmName}" on JOB INFO, "${projectMgr}" on YELLOW CARD) — using JOB INFO value.`
    );
  }

  // ── Build combined addresses ───────────────────────────────────────────────
  const customerAddress = [gcStreet, gcCity].filter(Boolean).join(", ");
  const jobAddress      = [jobStreet, jobCity].filter(Boolean).join(", ");
  const ownerAddress    = [ownerStreet, ownerCityStateZip].filter(Boolean).join(", ");

  // ── Flag gaps ─────────────────────────────────────────────────────────────
  if (!gcName)           warnings.push("GC / customer name not found — enter it manually.");
  if (!jobAddress)       warnings.push("Job address not found — enter it manually.");
  if (!awardDate)        warnings.push("Award / contract date not found — enter it manually.");
  if (!ownerName)        warnings.push("Owner not found — enter it manually.");
  if (retention === 0)   warnings.push("Retention % not found — enter it manually.");
  if (originalContract === 0) warnings.push("Original contract value (M10) not found.");
  if (tileScopeValue === 0)   warnings.push("Tile scope value (C35) not found.");
  if (!poNumber)         warnings.push("PO number not found — Job # has been left blank.");

  const draftJob: Omit<JobSetup, "contractValue"> = {
    // M6 on the yellowcard is literally labeled "Job Name" — map it directly
    jobName:                jobName,
    // PO number is the best candidate for the internal job number
    jobNumber:              poNumber,
    customer:               gcName,
    customerAddress,
    gcId:                   null,
    paymentTerms:           "",
    owner:                  ownerName,
    ownerAddress,
    jobAddress,
    architect:              "",
    architectAddress:       "",
    // GC's own project number goes here; architect is often unspecified
    architectProjectNumber: gcProject,
    contractFor:            "",
    contractDate:           awardDate,
    startDate:              "",
    retentionRateCW:        retention,
    retentionRateSM:        retention,
    ctiPm:                  projectMgr || ctiPmName,
    retentionStepdownThreshold: null,
    retentionStepdownRateCW: null,
    billingDueDay: 15,
    billingCheckinMonth: new Date().toISOString().slice(0, 7),
    billingPlatform: "",
    certifiedPayroll: false,
  };

  const extras: YellowcardExtras = {
    gcPhone,
    gcPmName,
    gcPmEmail,
    ctiPmName: projectMgr || ctiPmName,
    ctiEmail,
    ctiPhone,
    estimator,
    county,
    ohAndPPercent,
    changeOrderRatePercent,
    ownerContact,
    ownerPhone,
    poNumber,
    projectMgrName: projectMgr,
  };

  return { draftJob, warnings, originalContract, tileScopeValue, extras };
}
