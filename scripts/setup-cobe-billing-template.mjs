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

import { PDFDocument, PDFName, PDFDict, PDFRef, PDFHexString, PDFString, StandardFonts, rgb } from "pdf-lib";
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

// COBE built the Final page by copy-pasting the Progress page, so 14 fields
// ended up with the exact same /T name on both pages (no /Parent-/Kids
// relationship — just a name collision): From, To, Invoice #,
// $389,270.00, the 5 Change Order contracted-amount fields, Payment, Net
// Total To Be Paid, Amount of Check: $, Claimant's Signature, and
// Claimant's Title. Compliant PDF viewers (pdfium, Acrobat, Chrome's
// built-in viewer) treat same-named fields as one logical field and
// synchronize their value/appearance — so filling in the Final page's
// copy while the Progress page's copy sits blank made viewers display
// the *Progress* page's (blank) state, not what we'd actually written.
// Renaming every Final-page collision with a " p17" suffix (matching the
// suffix convention COBE's own non-colliding fields already use) removes
// the collision at the source, in the stored template itself.
const RENAME_ON_FINAL = [
  "From",
  "To",
  "Invoice #",
  "$389,270.00",
  "Change Order #1",
  "Change Order #2",
  "Change Order #3",
  "Change Order #4",
  "Change Order #",
  "Payment",
  "Net Total To Be Paid",
  "Amount of Check: $",
  "Claimant's Signature",
  "Claimant's Title",
];

// The "Base"/"Change Order #1"..."#4"/"Change Order #_" row labels in the
// left column of the table are static page content in COBE's original
// template, not form fields — Jason wants them editable (e.g. to write in
// the GC's real change-order number, like "Change Order #17", instead of
// Syntriq's own 1st/2nd/3rd/4th ordering). Rects hand-measured against the
// actual source PDF (pdfjs-dist text-position dump cross-checked against
// the neighboring money fields' own Rects, which share the same row
// y-bounds) — x1 stops a couple points short of the Contracted Amount
// column (x≈280–282) so the field never crosses that column's grid line.
// Progress and Final share the same x-range (COBE copy-pasted the page) but
// differ in y since Final drops the Subtotal/Retention rows above. Base's
// y-bounds are deliberately the Base Requested Payment field's own Rect
// (the "$389,270.00" field), not the row's actual (taller) money-column
// box — COBE drew the Base Contracted Amount box ~2.5pt taller than every
// other row's (see matchRectHeight below, which corrects that box down to
// the same bounds at fill time); reusing them here keeps Base's label the
// same height as every Change Order label instead of inheriting that
// quirk and overflowing into the row/border above.
const PROGRESS_LABEL_ROWS = [
  { suffix: "Base", text: "Base", rect: [197, 550.9911, 278, 562.5967] },
  { suffix: "CO1", text: "Change Order #1", rect: [197, 535.9039, 278, 547.5095] },
  { suffix: "CO2", text: "Change Order #2", rect: [197, 520.8167, 278, 532.4222] },
  { suffix: "CO3", text: "Change Order #3", rect: [197, 506.1163, 278, 517.7219] },
  { suffix: "CO4", text: "Change Order #4", rect: [197, 491.0291, 278, 502.6346] },
  { suffix: "CO_", text: "Change Order #_", rect: [197, 475.9419, 278, 487.5474] },
];

const FINAL_LABEL_ROWS = [
  { suffix: "Base", text: "Base", rect: [197, 543.641, 278, 555.2466] },
  { suffix: "CO1", text: "Change Order #1", rect: [197, 528.5537, 278, 540.1593] },
  { suffix: "CO2", text: "Change Order #2", rect: [197, 513.4665, 278, 525.0721] },
  { suffix: "CO3", text: "Change Order #3", rect: [197, 498.3793, 278, 509.9848] },
  { suffix: "CO4", text: "Change Order #4", rect: [197, 483.6789, 278, 494.8976] },
  { suffix: "CO_", text: "Change Order #_", rect: [197, 468.5917, 278, 480.1972] },
];

const LABEL_FONT_SIZE = 9.75; // matches the baked-in label text it replaces

// Draws a white rect over the old baked-in label text (erasing it) and adds
// a real AcroForm text field in its place, pre-filled with that same text.
// Must run on the ORIGINAL (untrimmed, 19-page) doc/page indices, same as
// renameFinalPageCollisions — see the comment on that call in
// buildTrimmedTemplate for why.
function addEditableLabelFields(doc, font, pageIndex, rows, pageSuffix) {
  const page = doc.getPage(pageIndex);
  const form = doc.getForm();
  for (const row of rows) {
    const [x0, y0, x1, y1] = row.rect;
    page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, color: rgb(1, 1, 1) });
    const field = form.createTextField(`${row.suffix} Label ${pageSuffix}`);
    // Order matters: addToPage() is what gives the field its /DA entry —
    // setFontSize() throws MissingDAEntryError if called before it.
    field.addToPage(page, { x: x0, y: y0, width: x1 - x0, height: y1 - y0, font, borderWidth: 0 });
    field.setFontSize(LABEL_FONT_SIZE);
    field.setText(row.text);
  }
}

function fieldNameOf(doc, dict) {
  const t = dict.get(PDFName.of("T"));
  if (t instanceof PDFHexString || t instanceof PDFString) return t.decodeText();
  const parentRef = dict.get(PDFName.of("Parent"));
  if (parentRef instanceof PDFRef) {
    const parent = doc.context.lookup(parentRef, PDFDict);
    const pt = parent.get(PDFName.of("T"));
    if (pt instanceof PDFHexString || pt instanceof PDFString) return pt.decodeText();
  }
  return null;
}

function renameFinalPageCollisions(doc, pageIndex) {
  const page = doc.getPage(pageIndex);
  const annots = page.node.Annots();
  for (let i = 0; i < annots.size(); i++) {
    const ref = annots.get(i);
    const dict = doc.context.lookup(ref, PDFDict);
    const name = fieldNameOf(doc, dict);
    if (name && RENAME_ON_FINAL.includes(name)) {
      dict.set(PDFName.of("T"), PDFHexString.fromText(`${name} p17`));
    }
  }
}

async function buildTrimmedTemplate() {
  const bytes = fs.readFileSync(SOURCE_PDF);
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // Renaming/field-adding must happen BEFORE any removePage() call below:
  // pdf-lib's removePage() doesn't invalidate PDFDocument's internal page
  // cache, so doc.getPage(n) after even one removal silently returns a
  // stale, pre-removal page list — doing both here first, while the
  // original 19-page indices are still accurate, sidesteps that entirely.
  renameFinalPageCollisions(doc, FINAL_PAGE_INDEX_IN_SOURCE);
  addEditableLabelFields(doc, font, PROGRESS_PAGE_INDEX_IN_SOURCE, PROGRESS_LABEL_ROWS, "p16");
  addEditableLabelFields(doc, font, FINAL_PAGE_INDEX_IN_SOURCE, FINAL_LABEL_ROWS, "p17");
  const total = doc.getPageCount();
  for (let i = total - 1; i >= 0; i--) {
    if (i !== PROGRESS_PAGE_INDEX_IN_SOURCE && i !== FINAL_PAGE_INDEX_IN_SOURCE) doc.removePage(i);
  }
  return doc.save();
}

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
    baseLabel: "Base Label p16",
    changeOrderContracted: ["Change Order #1", "Change Order #2", "Change Order #3", "Change Order #4", "Change Order #"],
    changeOrderRequested: ["Payment", "Text61", "Text63", "Text65", "Text67"],
    changeOrderLabels: ["CO1 Label p16", "CO2 Label p16", "CO3 Label p16", "CO4 Label p16", "CO_ Label p16"],
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

// Field names here match RENAME_ON_FINAL's " p17" suffix above wherever
// the original name collided with the Progress page's copy.
const finalMapping = {
  kind: "pdf",
  page: 1,
  hasRetentionRow: false,
  fields: {
    from: "From p17",
    to: "To p17",
    invoiceNumber: "Invoice # p17",
    project: "COBE Project p17",
    poNumber: "PO# p17",
    subcontractor: "Subcontractor p17",
    accountingContact: "Accounting Contact p17",
    email: "Email p17",
    phone: "Phone p17",
    baseContractedAmount: "Base Contracted Amount p17",
    baseRequestedPayment: "$389,270.00 p17",
    baseLabel: "Base Label p17",
    changeOrderContracted: [
      "Change Order #1 p17",
      "Change Order #2 p17",
      "Change Order #3 p17",
      "Change Order #4 p17",
      "Change Order # p17",
    ],
    changeOrderRequested: ["Payment p17", "Text84", "Text86", "Text88", "Text90"],
    changeOrderLabels: ["CO1 Label p17", "CO2 Label p17", "CO3 Label p17", "CO4 Label p17", "CO_ Label p17"],
    netTotal: "Net Total To Be Paid p17",
    amountOfCheck: "Amount of Check: $ p17",
    checkPayableTo: "Check Payable To p17",
    nameOfClaimant: "Name of Claimant p17",
    nameOfCustomer: "Name of Customer p17",
    jobLocation: "Job Location p17",
    owner: "Owner p17",
    throughDate: "Through Date p17",
    claimantTitle: "Claimant's Title p17",
    dateOfSignature: "Date of Signature p17",
    signatureField: "Claimant's Signature p17",
  },
};

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const trimmedBytes = await buildTrimmedTemplate();
  // Versioned filename rather than a fixed one: re-uploading to the same
  // path with upsert doesn't reliably bust Supabase's/Cloudflare's edge
  // cache for everyone (observed stale downloads served well after a
  // fresh upload, on a delay that varies by edge location) — a brand new
  // path has nothing to be stale.
  const filePath = `${organizationId}/cobe-billing-form-v5.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("billing-form-templates")
    .upload(filePath, trimmedBytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log("Uploaded template to", filePath, `(${trimmedBytes.length} bytes)`);

  const rows = [
    {
      name: "COBE — Progress Payment",
      file_name: "COBE EXPRESS Pay Application — Progress.pdf",
      field_mapping: progressMapping,
    },
    {
      name: "COBE — Final Payment",
      file_name: "COBE EXPRESS Pay Application — Final.pdf",
      field_mapping: finalMapping,
    },
  ];

  // Update in place if this org already has these rows (e.g. re-running
  // after a template fix), otherwise insert fresh — never duplicate.
  for (const row of rows) {
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
      if (error) throw new Error(`Update failed for ${row.name}: ${error.message}`);
      console.log("Updated row:", row.name, existing.id);
    } else {
      const { data, error } = await supabase
        .from("billing_form_templates")
        .insert({ organization_id: organizationId, enabled: true, file_path: filePath, ...row })
        .select("id, name")
        .single();
      if (error) throw new Error(`Insert failed for ${row.name}: ${error.message}`);
      console.log("Inserted row:", data.name, data.id);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
