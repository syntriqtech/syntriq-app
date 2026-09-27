// One-off setup script for the COBE Construction "EXPRESS Pay Application"
// billing form — mirrors how CTI's Excel billing-form-template row was set
// up (see cti-billing-workbook-field-mapping.md): trims the GC's source PDF
// down to just the two pages Syntriq fills, uploads it to the
// billing-form-templates storage bucket, and inserts the two
// billing_form_templates rows (Progress + Final) with their field mappings
// hand-configured here. Not meant to be run again except to re-provision
// for another organization or after a template file update — see
// cobe-billing-form-field-mapping.md for the full mapping writeup.
//
// Usage: node --env-file=.env.local scripts/setup-cobe-billing-template.mjs <organizationId>

import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const organizationId = process.argv[2];
if (!organizationId) {
  console.error("Usage: node --env-file=.env.local scripts/setup-cobe-billing-template.mjs <organizationId>");
  process.exit(1);
}

const SOURCE_PDF = "COBE_Subcontract_Template_USE THIS.pdf";
const PROGRESS_PAGE_INDEX_IN_SOURCE = 15; // page 16
const FINAL_PAGE_INDEX_IN_SOURCE = 16; // page 17

async function buildTrimmedTemplate() {
  const bytes = fs.readFileSync(SOURCE_PDF);
  const doc = await PDFDocument.load(bytes);
  const total = doc.getPageCount();
  for (let i = total - 1; i >= 0; i--) {
    if (i !== PROGRESS_PAGE_INDEX_IN_SOURCE && i !== FINAL_PAGE_INDEX_IN_SOURCE) doc.removePage(i);
  }
  return doc.save();
}

const sharedChangeOrderContracted = ["Change Order #1", "Change Order #2", "Change Order #3", "Change Order #4", "Change Order #"];

const progressMapping = {
  kind: "pdf",
  page: 0,
  hasRetentionRow: true,
  fields: {
    from: "From",
    to: "To",
    invoiceNumber: "Invoice #",
    project: "COBE Project p16",
    poNumber: "PO# p16",
    subcontractor: "Subcontractor p16",
    accountingContact: "Accounting Contact p16",
    email: "Email p16",
    phone: "Phone p16",
    baseContractedAmount: "Base Contracted Amount p16",
    baseRequestedPayment: "$389,270.00",
    changeOrderContracted: sharedChangeOrderContracted,
    changeOrderRequested: ["Payment", "Text61", "Text63", "Text65", "Text67"],
    subtotal: "Subtotal",
    retention: "10% Retention",
    netTotal: "Net Total To Be Paid",
    amountOfCheck: "Amount of Check: $",
    checkPayableTo: "Check Payable To p16",
    nameOfClaimant: "Name of Claimant p16",
    nameOfCustomer: "Name of Customer p16",
    jobLocation: "Job Location p16",
    owner: "Owner p16",
    throughDate: "Through Date p16",
    claimantTitle: "Claimant's Title",
    dateOfSignature: "Date of Signature p16",
    signatureField: "Claimant's Signature",
  },
};

const finalMapping = {
  kind: "pdf",
  page: 1,
  hasRetentionRow: false,
  fields: {
    from: "From",
    to: "To",
    invoiceNumber: "Invoice #",
    project: "COBE Project p17",
    poNumber: "PO# p17",
    subcontractor: "Subcontractor p17",
    accountingContact: "Accounting Contact p17",
    email: "Email p17",
    phone: "Phone p17",
    baseContractedAmount: "Base Contracted Amount p17",
    baseRequestedPayment: "$389,270.00",
    changeOrderContracted: sharedChangeOrderContracted,
    changeOrderRequested: ["Payment", "Text84", "Text86", "Text88", "Text90"],
    netTotal: "Net Total To Be Paid",
    amountOfCheck: "Amount of Check: $",
    checkPayableTo: "Check Payable To p17",
    nameOfClaimant: "Name of Claimant p17",
    nameOfCustomer: "Name of Customer p17",
    jobLocation: "Job Location p17",
    owner: "Owner p17",
    throughDate: "Through Date p17",
    claimantTitle: "Claimant's Title",
    dateOfSignature: "Date of Signature p17",
    signatureField: "Claimant's Signature",
  },
};

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const trimmedBytes = await buildTrimmedTemplate();
  const filePath = `${organizationId}/cobe-billing-form.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("billing-form-templates")
    .upload(filePath, trimmedBytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log("Uploaded template to", filePath, `(${trimmedBytes.length} bytes)`);

  const rows = [
    {
      organization_id: organizationId,
      name: "COBE — Progress Payment",
      enabled: true,
      file_path: filePath,
      file_name: "COBE EXPRESS Pay Application — Progress.pdf",
      field_mapping: progressMapping,
    },
    {
      organization_id: organizationId,
      name: "COBE — Final Payment",
      enabled: true,
      file_path: filePath,
      file_name: "COBE EXPRESS Pay Application — Final.pdf",
      field_mapping: finalMapping,
    },
  ];

  const { data, error } = await supabase.from("billing_form_templates").insert(rows).select("id, name");
  if (error) throw new Error(`Insert failed: ${error.message}`);
  console.log("Inserted rows:", data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
