import { PDFDocument } from "pdf-lib";

// Fill engine for Axis Mechanical Inc's fillable-PDF pay application (a
// GC-provided AcroForm, page 1 of 2 — see axis-billing-form-field-mapping
// notes in the setup script). Parallel to billingPdfFill.ts (COBE) and
// billingWorkbookFill.ts (CTI/24-7), but simpler: Axis's 120 named fields
// have no cross-page name collisions, so plain pdf-lib form.getTextField()
// lookups work directly instead of the page-scoped widget search COBE
// needs. Axis's field layout is fixed (not a hand-configured mapping DSL),
// so the field names are hardcoded here rather than stored as JSON.
//
// Unlike COBE, Axis's output must be flattened (not left as an editable
// AcroForm) and only page 1 (the pay application) is emitted — page 2
// (Axis's Change Order form) stays in the stored template untouched for a
// later feature, and is simply dropped from the generated file.
export type AxisBillingPdfData = {
  applicationNumber: string;
  applicationDate: string; // ISO yyyy-mm-dd
  invoiceNumber: string;
  gcProjectNumber: string;
  jobName: string;
  jobAddress: string; // one line: street, city, state, zip
  internalJobNumber: string;
  subcontractorName: string;
  subcontractorAddress: string; // one line
  subcontractorContact: string; // PM name + phone, or company phone fallback
  originalContractValue: number;
  approvedChangeOrderCount: number;
  approvedChangeOrderAmount: number;
  completedToDate: number; // gross, G702 line 4 basis
  previouslyBilled: number; // gross, before retention
  retentionRatePct: number; // e.g. 10 meaning 10%
};

export type AxisBillingPdfTotals = {
  revisedContract: number;
  percentComplete: number | null; // null when revisedContract is 0 — leave the field blank
  amountThisRequest: number;
  retention: number;
  amountDue: number;
};

export function computeAxisBillingTotals(data: AxisBillingPdfData): AxisBillingPdfTotals {
  const revisedContract = data.originalContractValue + data.approvedChangeOrderAmount;
  const percentComplete = revisedContract !== 0 ? (data.completedToDate / revisedContract) * 100 : null;
  const amountThisRequest = data.completedToDate - data.previouslyBilled;
  const retention = amountThisRequest * (data.retentionRatePct / 100);
  const amountDue = amountThisRequest - retention;
  return { revisedContract, percentComplete, amountThisRequest, retention, amountDue };
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

// Plain number, comma-grouped, 2 decimals, no "$" — the form already prints
// the dollar sign where Axis wants it.
function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function fillAxisBillingPdf(templateBuffer: ArrayBuffer, data: AxisBillingPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBuffer);
  const form = doc.getForm();
  const totals = computeAxisBillingTotals(data);

  function setText(name: string, value: string) {
    form.getTextField(name).setText(value);
  }

  setText("application_no", data.applicationNumber);
  setText("application_date", formatDate(data.applicationDate));
  setText("invoice_no", data.invoiceNumber);
  setText("axis_job_no", data.gcProjectNumber);
  setText("axis_job_name", data.jobName);
  setText("location", data.jobAddress);
  setText("subcontractor_job_no", data.internalJobNumber);
  setText("subcontractor_name", data.subcontractorName);
  setText("subcontractor_address", data.subcontractorAddress);
  setText("subcontractor_contact", data.subcontractorContact);

  setText("line1_original_contract", money(data.originalContractValue));
  setText("line2_approved_co_count", String(data.approvedChangeOrderCount));
  setText("line2_approved_co_amount", money(data.approvedChangeOrderAmount));
  setText("line3_revised_contract", money(totals.revisedContract));
  setText("line4_completed_to_date", money(data.completedToDate));
  // Leave blank rather than writing an error value (e.g. "#DIV/0!") when the
  // revised contract is 0 — matches every other Syntriq %-complete field.
  setText("line4_percent_complete", totals.percentComplete !== null ? `${totals.percentComplete.toFixed(2)}%` : "");
  setText("line5_previously_billed", money(data.previouslyBilled));
  setText("line6_amount_this_request", money(totals.amountThisRequest));
  setText("line7_retention", money(totals.retention));
  setText("line8_amount_due", money(totals.amountDue));

  // Axis's Acrobat calculation scripts live on these fields but pdf-lib
  // never runs them — every value above is computed by us and written
  // directly, so the scripts are simply inert dead weight in the output.
  form.flatten();

  // Page 2 (Axis's Contract and Purchase Order Change Form) isn't wired up
  // yet — drop it from the generated file. Flattening first (while page 2
  // is still present) avoids leaving orphaned AcroForm state behind.
  doc.removePage(1);

  return doc.save();
}
