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

// COBE built this form by copy-pasting the Progress page to make the Final
// page, so a lot of field NAMES collide across the two pages (e.g. both
// pages have their own, entirely separate field literally named
// "$389,270.00") without any /Parent-/Kids relationship tying them
// together — they just happen to share a name. pdf-lib's own name-based
// lookups (form.getTextField(name), etc.) aren't page-aware and always
// resolve a colliding name to whichever one of the two comes first in the
// document — the Progress one — which silently corrupted the Final page's
// fill (Adobe/pdfium happen to paper over *values* via same-name
// synchronization, so it looked right in some viewers, but geometry reads
// like getWidgets()[0] have no such fallback and just picked the wrong
// page's box). Every read/write here goes through this page-scoped lookup
// instead, so it always resolves to the widget that's actually sitting on
// the page we're filling.
function findWidgetByName(doc: PDFDocument, page: PDFPage, name: string): { ref: PDFRef; dict: PDFDict } | null {
  const annotsRef = page.node.Annots();
  if (!annotsRef) return null;
  for (let i = 0; i < annotsRef.size(); i++) {
    const ref = annotsRef.get(i) as PDFRef;
    const dict = doc.context.lookup(ref, PDFDict);
    if (fieldNameOf(doc, dict) === name) return { ref, dict };
  }
  return null;
}

// Directly poking a field's /V (rather than going through
// form.getTextField(name).setText(), which the shared-name collision above
// rules out) skips the bookkeeping that setText() normally does — most
// importantly marking the field dirty. Some of COBE's fields already ship
// with a baked (blank) appearance stream and some don't; for the ones that
// do, form.updateFieldAppearances() (called by doc.save()) only
// regenerates a field's appearance when it's dirty, so without this an
// edited field with a pre-existing blank appearance would keep showing
// blank despite /V being set correctly underneath. Marking it dirty here
// forces every field we touch to get a fresh appearance regardless.
function setText(doc: PDFDocument, page: PDFPage, name: string | undefined, value: string) {
  if (!name) return;
  const widget = findWidgetByName(doc, page, name);
  if (!widget) return;
  widget.dict.set(PDFName.of("V"), PDFHexString.fromText(value));
  doc.getForm().markFieldAsDirty(widget.ref);
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
// instead of the declared 9pt. Writing a brand new, cleanly-formatted /DA
// string (rather than trying to patch the existing one) sidesteps the bad
// escaping entirely and gives every currency cell the same explicit size.
// 8pt comfortably fits every box in the table (the shortest is ~11pt tall)
// and still fits a 7-figure amount in the narrowest (~65pt-wide) column.
const CURRENCY_FONT_SIZE = 8;

function setCurrencyText(doc: PDFDocument, page: PDFPage, name: string | undefined, value: string) {
  if (!name) return;
  const widget = findWidgetByName(doc, page, name);
  if (!widget) return;
  widget.dict.set(PDFName.of("DA"), PDFString.of(`0 g /Helvetica ${CURRENCY_FONT_SIZE} Tf`));
  widget.dict.set(PDFName.of("V"), PDFHexString.fromText(value));
  doc.getForm().markFieldAsDirty(widget.ref);
}

// COBE's "Base Contracted Amount" box is drawn ~2.5pt taller than every
// other cell in the table (its neighbor, the Base Requested Payment box
// right next to it, and every Contracted/Requested pair in every other
// row, all share one consistent height) — a rough edge in COBE's own
// template, not something introduced by filling it in. Borrowing the
// sibling cell's exact top/bottom makes the row sit flush like every
// other row, while keeping this field's own left/right edges.
function matchRectHeight(doc: PDFDocument, page: PDFPage, targetName: string | undefined, referenceName: string | undefined) {
  if (!targetName || !referenceName) return;
  const target = findWidgetByName(doc, page, targetName);
  const reference = findWidgetByName(doc, page, referenceName);
  if (!target || !reference) return;
  const targetRect = target.dict.get(PDFName.of("Rect"));
  const referenceRect = reference.dict.get(PDFName.of("Rect"));
  if (!(targetRect instanceof PDFArray) || !(referenceRect instanceof PDFArray)) return;
  const [tx0, , tx1] = targetRect.asArray().map((n) => (n as PDFNumber).asNumber());
  const [, ry0, , ry1] = referenceRect.asArray().map((n) => (n as PDFNumber).asNumber());
  target.dict.set(PDFName.of("Rect"), doc.context.obj([tx0, ry0, tx1, ry1]));
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
  const page = doc.getPage(mapping.page);
  const f = mapping.fields;

  setText(doc, page, f.from, formatDate(data.periodFrom));
  setText(doc, page, f.to, formatDate(data.periodTo));
  setText(doc, page, f.invoiceNumber, data.invoiceNumber);
  setText(doc, page, f.project, data.job.name);
  setText(doc, page, f.poNumber, data.job.poNumber);
  setText(doc, page, f.subcontractor, data.company.name);
  setText(doc, page, f.accountingContact, data.company.contactName);
  setText(doc, page, f.email, data.company.contactEmail);
  setText(doc, page, f.phone, data.company.contactPhone);

  matchRectHeight(doc, page, f.baseContractedAmount, f.baseRequestedPayment);
  setCurrencyText(doc, page, f.baseContractedAmount, currency(data.job.contractValue));
  setCurrencyText(doc, page, f.baseRequestedPayment, currency(data.baseThisPeriod));

  // First 4 change orders fill their own numbered row; anything beyond that
  // gets combined into the form's one blank catch-all row.
  const numberedCount = Math.min(data.changeOrders.length, 4);
  let requestedTotal = data.baseThisPeriod;
  for (let i = 0; i < numberedCount; i++) {
    setCurrencyText(doc, page, f.changeOrderContracted[i], currency(data.changeOrders[i].scheduledValue));
    setCurrencyText(doc, page, f.changeOrderRequested[i], currency(data.changeOrders[i].thisPeriod));
    requestedTotal += data.changeOrders[i].thisPeriod;
  }
  if (data.changeOrders.length > 4) {
    const overflow = data.changeOrders.slice(4);
    const contracted = overflow.reduce((sum, co) => sum + co.scheduledValue, 0);
    const requested = overflow.reduce((sum, co) => sum + co.thisPeriod, 0);
    setCurrencyText(doc, page, f.changeOrderContracted[4], currency(contracted));
    setCurrencyText(doc, page, f.changeOrderRequested[4], currency(requested));
    requestedTotal += requested;
  }

  let netTotal = requestedTotal;
  if (mapping.hasRetentionRow) {
    const retention = (data.job.retentionRateCW / 100) * requestedTotal;
    netTotal = requestedTotal - retention;
    setCurrencyText(doc, page, f.subtotal, currency(requestedTotal));
    // The form pre-prints the minus sign next to this box — the value itself
    // should be the plain positive amount, not "-$x", or it renders doubled.
    setCurrencyText(doc, page, f.retention, currency(retention));
  }
  setCurrencyText(doc, page, f.netTotal, currency(netTotal));

  setCurrencyText(doc, page, f.amountOfCheck, currency(netTotal));
  setText(doc, page, f.checkPayableTo, data.company.name);
  setText(doc, page, f.nameOfClaimant, data.company.name);
  setText(doc, page, f.nameOfCustomer, data.job.customer);
  setText(doc, page, f.jobLocation, data.job.jobAddress);
  setText(doc, page, f.owner, data.job.owner);
  setText(doc, page, f.throughDate, formatDate(data.throughDate));
  setText(doc, page, f.claimantTitle, data.claimantTitle);
  setText(doc, page, f.dateOfSignature, formatDate(data.signatureDate));

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
