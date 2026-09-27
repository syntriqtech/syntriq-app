import { PDFDocument, PDFName, PDFDict, PDFRef, PDFPage, PDFHexString, PDFString, PDFArray, PDFNumber } from "pdf-lib";
import { SOVLineItem } from "@/lib/sovData";

// Fill engine for GC-specific fillable-PDF billing forms (first case: COBE
// Construction's "EXPRESS Pay Application" — see
// cobe-billing-form-field-mapping.md). Parallel to billingWorkbookFill.ts,
// which does the same job for Excel-based GC templates (CTI) — this one
// works against a real PDF AcroForm instead of spreadsheet cells.
//
// Shape of billing_form_templates.field_mapping when
// field_mapping.kind === "pdf". Deliberately concrete (named slots, not a
// generic dotted-path DSL) — this is a bespoke, hand-mapped form for one GC's
// fixed layout, not a general mapping language.
export type BillingPdfMapping = {
  kind: "pdf";
  // Which page (0-based) of the stored template file this row fills —
  // the template file holds both the Progress and Final pages, so the same
  // uploaded file is shared by both "COBE — Progress" and "COBE — Final"
  // template rows, distinguished only by this index (and the field names
  // below, which differ per page for the identifying-information block).
  page: number;
  // Progress has a Subtotal + Retention row above Net Total; Final pays out
  // in full (retention already released in an earlier period), so those two
  // fields are omitted on that row instead.
  hasRetentionRow: boolean;
  fields: {
    from: string;
    to: string;
    invoiceNumber: string;
    project: string;
    poNumber: string;
    subcontractor: string;
    accountingContact: string;
    email: string;
    phone: string;
    baseContractedAmount: string;
    baseRequestedPayment: string;
    // Up to 5 slots: 4 numbered Change Order rows + one blank catch-all row
    // for any change orders beyond the 4th (their amounts are summed
    // together into that last slot).
    changeOrderContracted: string[];
    changeOrderRequested: string[];
    subtotal?: string;
    retention?: string;
    netTotal: string;
    amountOfCheck: string;
    checkPayableTo: string;
    nameOfClaimant: string;
    nameOfCustomer: string;
    jobLocation: string;
    owner: string;
    throughDate: string;
    claimantTitle: string;
    dateOfSignature: string;
    // A real AcroForm /Sig (digital signature) field, not a text field — pdf-lib
    // can't fill those, so it's removed and a signature image is drawn in its
    // place instead (see drawSignatureOverWidget below).
    signatureField: string;
  };
};

export type BillingPdfData = {
  job: {
    name: string;
    poNumber: string;
    customer: string;
    jobAddress: string;
    owner: string;
    retentionRateCW: number; // e.g. 10 meaning 10%, matching retention_rate_cw's convention elsewhere
    contractValue: number;
  };
  company: {
    name: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  };
  invoiceNumber: string;
  periodFrom: string; // ISO yyyy-mm-dd
  periodTo: string; // ISO yyyy-mm-dd
  throughDate: string; // ISO yyyy-mm-dd
  signatureDate: string; // ISO yyyy-mm-dd
  claimantTitle: string;
  signatureDataUrl?: string;
  baseThisPeriod: number;
  changeOrders: SOVLineItem[];
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

// Runs in the browser (Download Package is a client component) — no Node
// Buffer available, so data URLs are decoded by hand via atob().
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function currency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function setText(form: ReturnType<PDFDocument["getForm"]>, name: string | undefined, value: string) {
  if (!name) return;
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Template field is missing or not a text field — leave it blank rather
    // than fail the whole download over one cosmetic field.
  }
}

// The dollar-amount cells in COBE's table render at wildly different sizes
// once filled (e.g. the Base row's Requested Payment box comes out at 6pt
// while the Contracted Amount box right next to it comes out at 9pt), even
// though every cell's /DA string literally declares the same "9 Tf". The
// template's DA strings are stored with a literal backslash-oh-five-seven
// ("\057") in place of the "/" before the font name (COBE's own PDF tool's
// quirk, not something wrong with our fill) — pdf-lib's regex for reading a
// field's declared font size expects a literal "/" and silently fails to
// match that, so every field falls back to auto-computed-per-box sizing
// instead of the declared 9pt (that's also why field.setFontSize() can't
// repair it — same regex, same failure to match, silently swallowed by the
// try/catch below). Writing a brand new, cleanly-formatted /DA string
// (rather than trying to patch the existing one) sidesteps the bad
// escaping entirely and gives every currency cell the same explicit size.
// 8pt comfortably fits every box in the table (the shortest is ~11pt tall)
// and still fits a 7-figure amount in the narrowest (~65pt-wide) column.
const CURRENCY_FONT_SIZE = 8;

function setCurrencyText(form: ReturnType<PDFDocument["getForm"]>, name: string | undefined, value: string) {
  if (!name) return;
  try {
    const field = form.getTextField(name);
    field.acroField.setDefaultAppearance(`0 g /Helvetica ${CURRENCY_FONT_SIZE} Tf`);
    field.setText(value);
  } catch {
    // Template field is missing or not a text field — leave it blank rather
    // than fail the whole download over one cosmetic field.
  }
}

function fieldNameOf(doc: PDFDocument, annotDict: PDFDict): string | null {
  const t = annotDict.get(PDFName.of("T"));
  if (t instanceof PDFHexString || t instanceof PDFString) return t.decodeText();
  const parentRef = annotDict.get(PDFName.of("Parent"));
  if (parentRef instanceof PDFRef) {
    const parent = doc.context.lookup(parentRef, PDFDict);
    const pt = parent.get(PDFName.of("T"));
    if (pt instanceof PDFHexString || pt instanceof PDFString) return pt.decodeText();
  }
  return null;
}

// Strips the named widget off the page (so an unsigned /Sig field doesn't
// render a "click to sign" placeholder in the output) and returns its
// on-page rectangle, so the caller can draw a signature image in its place.
function removeWidgetByFieldName(doc: PDFDocument, page: PDFPage, name: string): number[] | null {
  const annotsRef = page.node.Annots();
  if (!annotsRef) return null;
  let removedRect: number[] | null = null;
  const kept: PDFRef[] = [];
  for (let i = 0; i < annotsRef.size(); i++) {
    const ref = annotsRef.get(i) as PDFRef;
    const dict = doc.context.lookup(ref, PDFDict);
    const fname = fieldNameOf(doc, dict);
    if (fname === name) {
      const rectArr = dict.get(PDFName.of("Rect"));
      if (rectArr instanceof PDFArray) {
        removedRect = rectArr.asArray().map((n) => (n as PDFNumber).asNumber());
      }
      continue;
    }
    kept.push(ref);
  }
  page.node.set(PDFName.of("Annots"), doc.context.obj(kept));
  return removedRect;
}

export async function fillBillingPdf(templateBuffer: ArrayBuffer, mapping: BillingPdfMapping, data: BillingPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBuffer);
  const form = doc.getForm();
  const f = mapping.fields;

  setText(form, f.from, formatDate(data.periodFrom));
  setText(form, f.to, formatDate(data.periodTo));
  setText(form, f.invoiceNumber, data.invoiceNumber);
  setText(form, f.project, data.job.name);
  setText(form, f.poNumber, data.job.poNumber);
  setText(form, f.subcontractor, data.company.name);
  setText(form, f.accountingContact, data.company.contactName);
  setText(form, f.email, data.company.contactEmail);
  setText(form, f.phone, data.company.contactPhone);

  setCurrencyText(form, f.baseContractedAmount, currency(data.job.contractValue));
  setCurrencyText(form, f.baseRequestedPayment, currency(data.baseThisPeriod));

  // First 4 change orders fill their own numbered row; anything beyond that
  // gets combined into the form's one blank catch-all row.
  const numberedCount = Math.min(data.changeOrders.length, 4);
  let requestedTotal = data.baseThisPeriod;
  for (let i = 0; i < numberedCount; i++) {
    setCurrencyText(form, f.changeOrderContracted[i], currency(data.changeOrders[i].scheduledValue));
    setCurrencyText(form, f.changeOrderRequested[i], currency(data.changeOrders[i].thisPeriod));
    requestedTotal += data.changeOrders[i].thisPeriod;
  }
  if (data.changeOrders.length > 4) {
    const overflow = data.changeOrders.slice(4);
    const contracted = overflow.reduce((sum, co) => sum + co.scheduledValue, 0);
    const requested = overflow.reduce((sum, co) => sum + co.thisPeriod, 0);
    setCurrencyText(form, f.changeOrderContracted[4], currency(contracted));
    setCurrencyText(form, f.changeOrderRequested[4], currency(requested));
    requestedTotal += requested;
  }

  let netTotal = requestedTotal;
  if (mapping.hasRetentionRow) {
    const retention = (data.job.retentionRateCW / 100) * requestedTotal;
    netTotal = requestedTotal - retention;
    setCurrencyText(form, f.subtotal, currency(requestedTotal));
    // The form pre-prints the minus sign next to this box — the value itself
    // should be the plain positive amount, not "-$x", or it renders doubled.
    setCurrencyText(form, f.retention, currency(retention));
  }
  setCurrencyText(form, f.netTotal, currency(netTotal));

  setCurrencyText(form, f.amountOfCheck, currency(netTotal));
  setText(form, f.checkPayableTo, data.company.name);
  setText(form, f.nameOfClaimant, data.company.name);
  setText(form, f.nameOfCustomer, data.job.customer);
  setText(form, f.jobLocation, data.job.jobAddress);
  setText(form, f.owner, data.job.owner);
  setText(form, f.throughDate, formatDate(data.throughDate));
  setText(form, f.claimantTitle, data.claimantTitle);
  setText(form, f.dateOfSignature, formatDate(data.signatureDate));

  const page = doc.getPage(mapping.page);
  const sigRect = removeWidgetByFieldName(doc, page, f.signatureField);
  if (sigRect && data.signatureDataUrl) {
    const isPng = data.signatureDataUrl.startsWith("data:image/png");
    const bytes = dataUrlToBytes(data.signatureDataUrl);
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const [x0, y0, x1, y1] = sigRect;
    const boxW = x1 - x0;
    const boxH = y1 - y0 + 10; // a little headroom above the line, matching lienWaiverPdf's signature box
    const scale = Math.min(boxW / image.width, boxH / image.height);
    page.drawImage(image, { x: x0, y: y0, width: image.width * scale, height: image.height * scale });
  }

  const total = doc.getPageCount();
  for (let i = total - 1; i >= 0; i--) {
    if (i !== mapping.page) doc.removePage(i);
  }

  return doc.save();
}
