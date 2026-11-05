// One-off setup script for Cahill Guzman Construction Group's "Subcontractor
// Invoice" billing form (an Excel sheet, so it goes through the same
// billingWorkbookFill.ts engine as CTI's workbook).
//
// Step 1 (always): reads Cahill's filled-in example invoice, clears every
// job-specific input cell, keeps every formula, and writes the clean template
// to Cahill_Sub_Invoice_Template_Clean.xlsx so it can be eyeballed.
// Step 2 (only with an organizationId): uploads that file and adds/updates the
// "Cahill Billing Form" row in that org's Custom Billing Forms.
//
// Usage:
//   node scripts/setup-cahill-billing-template.mjs                    (build the clean file only)
//   node --env-file=.env.local scripts/setup-cahill-billing-template.mjs <organizationId>

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const organizationId = process.argv[2];

const SOURCE_XLSX = "Main-Cahill SUB INVOICE TEMPLATE (Procore SOV).xlsx";
const CLEAN_XLSX = "Cahill_Sub_Invoice_Template_Clean.xlsx";

const FIRST_ROW = 18; // first SOV line
const LAST_ROW = 32; // last row inside Cahill's own TOTAL sums (SUM(x18:x32))
const TOTAL_ROW = 34;

// Which Syntriq value lands in which cell — read by fillBillingWorkbook().
// Anything in {braces} is a text template (the form prints a label and the
// value together in one cell). Bill From (CTI's own name/address) is the same
// on every job, so it stays as printed in the template.
const FIELD_MAPPING = {
  fields: {
    Invoice: {
      G5: "payApp.applicationDate",
      H5: "payApp.invoiceNumber",
      B7: "PROJECT NAME: {job.name}",
      B8: "PROJECT # {gc.projectNumber}",
      B12: "gc.name",
      B13: "gc.street",
      B14: "gc.cityStateZip",
      F37: "job.retentionRateCW",
    },
  },
  lineItemBlocks: [
    {
      sheet: "Invoice",
      // Cahill's table is one list — change orders go right after the contract lines.
      source: "contractAndChangeOrders",
      startRow: FIRST_ROW,
      endRow: LAST_ROW,
      columns: {
        item: "A",
        description: "B",
        scheduledValue: "C",
        previousApplications: "D",
        currentApplication: "E",
      },
    },
  ],
};

async function buildCleanTemplate() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_XLSX);
  const sheet = workbook.getWorksheet("Invoice");

  // Clear the example job's inputs.
  for (const ref of ["G5", "H5", "B12", "B13", "B14", "F37"]) sheet.getCell(ref).value = null;
  sheet.getCell("B7").value = "PROJECT NAME:";
  sheet.getCell("B8").value = "PROJECT #";
  for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
    for (const col of ["A", "B", "C", "D", "E"]) sheet.getCell(`${col}${row}`).value = null;
  }
  sheet.getCell("G5").numFmt = "mm/dd/yyyy";

  // Same formulas as Cahill's template, written out cell by cell (the source
  // stores most as "shared" formulas) and carried down to rows 31-32, which
  // are inside Cahill's totals but had no formulas of their own.
  for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
    sheet.getCell(`F${row}`).value = { formula: `D${row}+E${row}`, result: 0 };
    sheet.getCell(`G${row}`).value = { formula: `IFERROR((F${row})/C${row},0)`, result: 0 };
    sheet.getCell(`H${row}`).value = { formula: `F${row}-D${row}`, result: 0 };
  }
  for (const col of ["C", "D", "E", "F", "H"]) {
    sheet.getCell(`${col}${TOTAL_ROW}`).value = { formula: `SUM(${col}${FIRST_ROW}:${col}${LAST_ROW})`, result: 0 };
  }
  sheet.getCell(`G${TOTAL_ROW}`).value = { formula: `IFERROR((F${TOTAL_ROW})/C${TOTAL_ROW},0)`, result: 0 };
  // H36 (Current Invoice Total) was =F34 (Total Completed to Date) in Cahill's
  // file, which re-bills everything from earlier applications on app 2+ — the
  // owner approved pointing it at this invoice's amount (E34) instead.
  // H37/H38 (Retention / Balance Due) are exactly as Cahill built them.
  sheet.getCell("H36").value = { formula: "E34", result: 0 };
  sheet.getCell("H37").value = { formula: "H36*F37", result: 0 };
  sheet.getCell("H38").value = { formula: "H36-H37", result: 0 };

  // The logo (a 200x107 image) is drawn in a much wider box in Cahill's file, so
  // it looks stretched sideways. Keep its height (rows 1-6) and set the width
  // to the image's real proportions.
  const logoHeightPx = 135;
  const logoRange = sheet.getImages()[0].range;
  logoRange.br = undefined; // no bottom-right corner -> sized by ext below
  logoRange.ext = { width: Math.round((logoHeightPx * 200) / 107), height: logoHeightPx };
  logoRange.editAs = "oneCell";

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(CLEAN_XLSX);
  console.log("Wrote", CLEAN_XLSX);
}

async function provision() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const bytes = fs.readFileSync(CLEAN_XLSX);

  // Versioned filename (bump -v3 if the file ever changes) — re-uploading to a
  // fixed path doesn't reliably bust edge caching; same reasoning as COBE/Axis.
  const filePath = `${organizationId}/cahill-billing-form-v3.xlsx`;
  const { error: uploadError } = await supabase.storage
    .from("billing-form-templates")
    .upload(filePath, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log("Uploaded template to", filePath, `(${bytes.length} bytes)`);

  const row = {
    name: "Cahill Billing Form",
    file_name: "Cahill Subcontractor Invoice.xlsx",
    field_mapping: FIELD_MAPPING,
  };

  const { data: existing } = await supabase
    .from("billing_form_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", row.name)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("billing_form_templates")
      .update({ file_path: filePath, file_name: row.file_name, field_mapping: row.field_mapping, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(`Update failed: ${error.message}`);
    console.log("Updated row:", row.name, existing.id);
  } else {
    const { data, error } = await supabase
      .from("billing_form_templates")
      .insert({ organization_id: organizationId, enabled: true, file_path: filePath, ...row })
      .select("id, name")
      .single();
    if (error) throw new Error(`Insert failed: ${error.message}`);
    console.log("Inserted row:", data.name, data.id);
  }
}

async function main() {
  await buildCleanTemplate();
  if (organizationId) await provision();
  else console.log("No organizationId given — built the clean file only, nothing uploaded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
