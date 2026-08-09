import jsPDF from "jspdf";
import { JobSetup } from "@/lib/jobSetupData";

export type LienWaiverKind =
  | "conditional-progress"
  | "unconditional-progress"
  | "conditional-final"
  | "unconditional-final";

export type LienWaiverData = {
  job: JobSetup;
  claimantName: string;
  amountOfCheck: number;
  throughDate: string;
  signatureDate: string;
  claimantTitle: string;
  unpaidProgressDates: string;
  unpaidProgressAmounts: string;
  disputedExtrasAmount: number;
  signatureDataUrl?: string;
};

const NAVY = "#1F3864";
const LABEL_GRAY = "#404040";
const BORDER = "#000000";
const MARGIN = 54;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function currency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function drawParagraph(doc: jsPDF, text: string, y: number, options?: { bold?: boolean; size?: number }) {
  doc.setFont("helvetica", options?.bold ? "bold" : "normal");
  doc.setFontSize(options?.size ?? 9.5);
  doc.setTextColor("#000000");
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 12;
}

function drawNoticeBlock(doc: jsPDF, lines: string[], y: number) {
  const PAD_X = 10;
  const PAD_Y = 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor("#000000");
  const wrapped = doc.splitTextToSize(lines.join(" "), CONTENT_WIDTH - PAD_X * 2);
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.75);
  const boxTop = y - PAD_Y;
  const boxHeight = wrapped.length * 12 + PAD_Y * 2;
  doc.rect(MARGIN, boxTop, CONTENT_WIDTH, boxHeight);
  doc.text(wrapped, MARGIN + PAD_X, y);
  return boxTop + boxHeight + 18;
}

function drawHeading(doc: jsPDF, text: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(NAVY);
  doc.text(text, MARGIN, y);
  return y + 14;
}

function drawField(doc: jsPDF, label: string, value: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(LABEL_GRAY);
  doc.text(label, MARGIN, y);
  const labelWidth = doc.getTextWidth(`${label} `);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#000000");
  const lines = doc.splitTextToSize(value || "—", CONTENT_WIDTH - labelWidth - 4);
  doc.text(lines, MARGIN + labelWidth + 4, y);
  return y + lines.length * 12;
}

function drawSignatureLine(doc: jsPDF, label: string, y: number, lineWidth: number, signatureDataUrl?: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(LABEL_GRAY);
  doc.text(label, MARGIN, y);
  const labelWidth = doc.getTextWidth(`${label} `);
  const lineX = MARGIN + labelWidth + 4;
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(lineX, y + 1.5, lineX + lineWidth, y + 1.5);
  if (signatureDataUrl) {
    const imgWidth = Math.min(lineWidth, 160);
    doc.addImage(signatureDataUrl, "PNG", lineX + 4, y - 30, imgWidth, 32);
  }
  return y + 18;
}

function drawTitle(doc: jsPDF, title: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(NAVY);
  const lines = doc.splitTextToSize(title, CONTENT_WIDTH);
  doc.text(lines, PAGE_WIDTH / 2, MARGIN, { align: "center" });
  return MARGIN + lines.length * 15 + 14;
}

function drawConditionalProgress(doc: jsPDF, data: LienWaiverData) {
  let y = drawTitle(doc, "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT");
  y = drawNoticeBlock(
    doc,
    [
      "NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT",
      "NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT.",
      "A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT",
      "THE CLAIMANT HAS RECEIVED PAYMENT.",
    ],
    y
  );

  y = drawHeading(doc, "Identifying Information", y);
  y = drawField(doc, "Name of Claimant:", data.claimantName, y) + 2;
  y = drawField(doc, "Name of Customer:", data.job.customer, y) + 2;
  y = drawField(doc, "Job Location:", data.job.jobAddress, y) + 2;
  y = drawField(doc, "Owner:", data.job.owner, y) + 2;
  y = drawField(doc, "Through Date:", formatDate(data.throughDate), y) + 14;

  y = drawHeading(doc, "Conditional Waiver and Release", y);
  y = drawParagraph(
    doc,
    "This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the Through Date of this Document. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an exception below. This document is effective only on the claimant's receipt of payment from the financial institution on which the following check is drawn:",
    y
  ) + 10;

  y = drawField(doc, "Maker of Check:", data.job.customer, y) + 2;
  y = drawField(doc, "Amount of Check:", currency(data.amountOfCheck), y) + 2;
  y = drawField(doc, "Check Payable to:", data.claimantName, y) + 14;

  y = drawHeading(doc, "Exceptions", y);
  y = drawParagraph(doc, "This document does not affect any of the following:", y) + 4;
  y = drawParagraph(doc, "(1) Retentions.", y) + 2;
  y = drawParagraph(doc, "(2) Extras for which the claimant has not received payment.", y) + 2;
  y = drawParagraph(
    doc,
    "(3) The following progress payments for which the claimant has previously given a conditional waiver and release but has not received payment:",
    y
  ) + 4;
  y = drawField(doc, "Date(s) of waiver and release:", data.unpaidProgressDates, y) + 2;
  y = drawField(doc, "Amount(s) of unpaid progress payment(s):", data.unpaidProgressAmounts, y) + 4;
  y = drawParagraph(
    doc,
    "(4) Contract rights, including (A) a right based on rescission, abandonment, or breach of contract, and (B) the right to recover compensation for work not compensated by the payment.",
    y
  ) + 24;

  y = drawHeading(doc, "Signature", y);
  y = drawSignatureLine(doc, "Claimant's Signature:", y, 220, data.signatureDataUrl);
  y = drawField(doc, "Claimant's Title:", data.claimantTitle, y) + 2;
  drawField(doc, "Date of Signature:", formatDate(data.signatureDate), y);
}

function drawUnconditionalProgress(doc: jsPDF, data: LienWaiverData) {
  let y = drawTitle(doc, "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT");
  y = drawNoticeBlock(
    doc,
    [
      "NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP",
      "PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND",
      "STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS",
      "DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU",
      "HAVE NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL",
      "WAIVER AND RELEASE FORM.",
    ],
    y
  );

  y = drawHeading(doc, "Identifying Information", y);
  y = drawField(doc, "Name of Claimant:", data.claimantName, y) + 2;
  y = drawField(doc, "Name of Customer:", data.job.customer, y) + 2;
  y = drawField(doc, "Job Location:", data.job.jobAddress, y) + 2;
  y = drawField(doc, "Owner:", data.job.owner, y) + 2;
  y = drawField(doc, "Through Date:", formatDate(data.throughDate), y) + 14;

  y = drawHeading(doc, "Unconditional Waiver and Release", y);
  y = drawParagraph(
    doc,
    "This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the Through Date of this Document. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an exception below. The claimant has received the following progress payment:",
    y
  ) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor("#000000");
  doc.text(currency(data.amountOfCheck), MARGIN, y);
  y += 22;

  y = drawHeading(doc, "Exceptions", y);
  y = drawParagraph(doc, "This document does not affect any of the following:", y) + 4;
  y = drawParagraph(doc, "(1) Retentions.", y) + 2;
  y = drawParagraph(doc, "(2) Extras for which the claimant has not received payment.", y) + 2;
  y = drawParagraph(
    doc,
    "(3) Contract rights, including (A) a right based on rescission, abandonment, or breach of contract, and (B) the right to recover compensation for work not compensated by the payment.",
    y
  ) + 24;

  y = drawHeading(doc, "Signature", y);
  y = drawSignatureLine(doc, "Claimant's Signature:", y, 220, data.signatureDataUrl);
  y = drawField(doc, "Claimant's Title:", data.claimantTitle, y) + 2;
  drawField(doc, "Date of Signature:", formatDate(data.signatureDate), y);
}

function drawConditionalFinal(doc: jsPDF, data: LienWaiverData) {
  let y = drawTitle(doc, "CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT");
  y = drawNoticeBlock(
    doc,
    [
      "NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT",
      "NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT.",
      "A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT",
      "THE CLAIMANT HAS RECEIVED PAYMENT.",
    ],
    y
  );

  y = drawHeading(doc, "Identifying Information", y);
  y = drawField(doc, "Name of Claimant:", data.claimantName, y) + 2;
  y = drawField(doc, "Name of Customer:", data.job.customer, y) + 2;
  y = drawField(doc, "Job Location:", data.job.jobAddress, y) + 2;
  y = drawField(doc, "Owner:", data.job.owner, y) + 14;

  y = drawHeading(doc, "Conditional Waiver and Release", y);
  y = drawParagraph(
    doc,
    "This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below. This document is effective only on the claimant's receipt of payment from the financial institution on which the following check is drawn:",
    y
  ) + 10;

  y = drawField(doc, "Maker of Check:", data.job.customer, y) + 2;
  y = drawField(doc, "Amount of Check:", currency(data.amountOfCheck), y) + 2;
  y = drawField(doc, "Check Payable to:", data.claimantName, y) + 14;

  y = drawHeading(doc, "Exceptions", y);
  y = drawParagraph(doc, "This document does not affect any of the following:", y) + 4;
  y = drawField(doc, "Disputed claims for extras in the amount of:", currency(data.disputedExtrasAmount), y) + 24;

  y = drawHeading(doc, "Signature", y);
  y = drawSignatureLine(doc, "Claimant's Signature:", y, 220, data.signatureDataUrl);
  y = drawField(doc, "Claimant's Title:", data.claimantTitle, y) + 2;
  drawField(doc, "Date of Signature:", formatDate(data.signatureDate), y);
}

function drawUnconditionalFinal(doc: jsPDF, data: LienWaiverData) {
  let y = drawTitle(doc, "UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT");
  y = drawNoticeBlock(
    doc,
    [
      "NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP",
      "PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND",
      "STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS",
      "DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE",
      "NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL WAIVER",
      "AND RELEASE FORM.",
    ],
    y
  );

  y = drawHeading(doc, "Identifying Information", y);
  y = drawField(doc, "Name of Claimant:", data.claimantName, y) + 2;
  y = drawField(doc, "Name of Customer:", data.job.customer, y) + 2;
  y = drawField(doc, "Job Location:", data.job.jobAddress, y) + 2;
  y = drawField(doc, "Owner:", data.job.owner, y) + 14;

  y = drawHeading(doc, "Unconditional Waiver and Release", y);
  y = drawParagraph(
    doc,
    "This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below. The claimant has been paid in full.",
    y
  ) + 14;

  y = drawHeading(doc, "Exceptions", y);
  y = drawParagraph(doc, "This document does not affect any of the following:", y) + 4;
  y = drawField(doc, "Disputed claims for extras in the amount of:", currency(data.disputedExtrasAmount), y) + 24;

  y = drawHeading(doc, "Signature", y);
  y = drawSignatureLine(doc, "Claimant's Signature:", y, 220, data.signatureDataUrl);
  y = drawField(doc, "Claimant's Title:", data.claimantTitle, y) + 2;
  drawField(doc, "Date of Signature:", formatDate(data.signatureDate), y);
}

const FILENAME_BY_KIND: Record<LienWaiverKind, string> = {
  "conditional-progress": "conditional-waiver-progress",
  "unconditional-progress": "unconditional-waiver-progress",
  "conditional-final": "conditional-waiver-final",
  "unconditional-final": "unconditional-waiver-final",
};

export function buildLienWaiverDoc(data: LienWaiverData, kind: LienWaiverKind) {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });

  if (kind === "conditional-progress") drawConditionalProgress(doc, data);
  if (kind === "unconditional-progress") drawUnconditionalProgress(doc, data);
  if (kind === "conditional-final") drawConditionalFinal(doc, data);
  if (kind === "unconditional-final") drawUnconditionalFinal(doc, data);

  return doc;
}

export function exportLienWaiverPdf(data: LienWaiverData, kind: LienWaiverKind) {
  const doc = buildLienWaiverDoc(data, kind);
  doc.save(`${data.job.jobNumber}-${FILENAME_BY_KIND[kind]}.pdf`);
}
