import jsPDF from "jspdf";
import { DbJob } from "@/lib/jobs";
import { RetentionRelease } from "@/lib/retentionReleasesDb";

const NAVY = "#1F3864";
const LABEL_GRAY = "#404040";
const BORDER = "#CCCCCC";
const MARGIN = 54;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function fmt(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function text(doc: jsPDF, str: string, x: number, y: number, opts?: { bold?: boolean; size?: number; color?: string; align?: "left" | "center" | "right" }) {
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(opts?.size ?? 9.5);
  doc.setTextColor(opts?.color ?? "#000000");
  doc.text(str, x, y, { align: opts?.align ?? "left" });
}

function label(doc: jsPDF, lbl: string, val: string, x: number, y: number): number {
  const lw = doc.getTextWidth(lbl + " ");
  text(doc, lbl, x, y, { bold: true, color: LABEL_GRAY, size: 9.5 });
  text(doc, val || "—", x + lw + 2, y, { size: 9.5 });
  return y + 13;
}

function rule(doc: jsPDF, y: number) {
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  return y + 10;
}

export type RetentionReleasePdfInput = {
  job: DbJob;
  contractorName: string;
  release: RetentionRelease;
  retentionHeld: number;
  previouslyReleased: number;
};

export function exportRetentionReleasePdf(input: RetentionReleasePdfInput): void {
  const { job, contractorName, release, retentionHeld, previouslyReleased } = input;
  const remaining = Math.max(0, retentionHeld - previouslyReleased - release.amountReleased);

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });

  // Title
  text(doc, "RETENTION RELEASE BILLING", PAGE_WIDTH / 2, MARGIN, { bold: true, size: 14, color: NAVY, align: "center" });
  text(doc, `Release #${release.releaseNumber} — ${release.isFinal ? "FINAL" : "Partial"}`, PAGE_WIDTH / 2, MARGIN + 17, { size: 10, color: LABEL_GRAY, align: "center" });

  let y = MARGIN + 40;
  y = rule(doc, y);
  y += 4;

  // Two-column header info
  const col2 = PAGE_WIDTH / 2 + 10;

  text(doc, "Contractor:", MARGIN, y, { bold: true, color: LABEL_GRAY, size: 9.5 });
  text(doc, contractorName, MARGIN + doc.getTextWidth("Contractor: "), y, { size: 9.5 });
  text(doc, "Release Date:", col2, y, { bold: true, color: LABEL_GRAY, size: 9.5 });
  text(doc, fmtDate(release.releaseDate), col2 + doc.getTextWidth("Release Date: "), y, { size: 9.5 });
  y += 13;

  text(doc, "Job Number:", MARGIN, y, { bold: true, color: LABEL_GRAY, size: 9.5 });
  text(doc, job.jobNumber, MARGIN + doc.getTextWidth("Job Number: "), y, { size: 9.5 });
  text(doc, "Release Type:", col2, y, { bold: true, color: LABEL_GRAY, size: 9.5 });
  text(doc, release.isFinal ? "Final Release" : "Partial Release", col2 + doc.getTextWidth("Release Type: "), y, { size: 9.5 });
  y += 13;

  text(doc, "Customer (GC):", MARGIN, y, { bold: true, color: LABEL_GRAY, size: 9.5 });
  text(doc, job.customer, MARGIN + doc.getTextWidth("Customer (GC): "), y, { size: 9.5 });
  y += 13;

  y = label(doc, "Job Address:", job.jobAddress, MARGIN, y);
  y += 4;

  y = rule(doc, y);
  y += 8;

  // Retention summary table
  text(doc, "RETENTION SUMMARY", MARGIN, y, { bold: true, size: 11, color: NAVY });
  y += 18;

  const valX = MARGIN + CONTENT_WIDTH;

  function summaryRow(lbl: string, val: string, bold = false, extraY = 0) {
    text(doc, lbl, MARGIN + 8, y, { bold, size: 10 });
    text(doc, val, valX, y, { bold, size: 10, align: "right" });
    y += 16 + extraY;
  }

  // Box around the summary
  const boxTop = y - 6;

  summaryRow("Total Retainage Held (current period):", fmt(retentionHeld));
  summaryRow(`Previously Released (${release.releaseNumber - 1} prior release${release.releaseNumber - 1 !== 1 ? "s" : ""}):`, fmt(previouslyReleased));

  // Divider
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 4, y - 4, MARGIN + CONTENT_WIDTH - 4, y - 4);
  y += 2;

  summaryRow(`This Release${release.isFinal ? " (Final)" : ""}:`, fmt(release.amountReleased), true, 2);
  summaryRow("Remaining Retention After This Release:", fmt(remaining), false, 4);

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.75);
  doc.rect(MARGIN, boxTop, CONTENT_WIDTH, y - boxTop - 4);

  y += 4;
  y = rule(doc, y);
  y += 8;

  // Notes
  if (release.notes) {
    text(doc, "NOTES", MARGIN, y, { bold: true, size: 10, color: NAVY });
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor("#000000");
    const noteLines = doc.splitTextToSize(release.notes, CONTENT_WIDTH);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 12 + 8;
    y = rule(doc, y);
    y += 8;
  }

  // Lien waiver guidance
  const waiverNote = release.isFinal
    ? "This is a final retention release. When transmitting this bill, use a Conditional Waiver and Release on Final Payment (Cal. Civil Code §8136). Once payment is received, execute an Unconditional Waiver and Release on Final Payment (§8138). Generate both waivers on the Lien Waivers page."
    : "This is a partial retention release. When transmitting this bill, use a Conditional Waiver and Release on Progress Payment (Cal. Civil Code §8132). Once payment is received, execute an Unconditional Waiver and Release on Progress Payment (§8134). Generate both waivers on the Lien Waivers page.";

  text(doc, "LIEN WAIVER GUIDANCE", MARGIN, y, { bold: true, size: 10, color: NAVY });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#404040");
  const waiverLines = doc.splitTextToSize(waiverNote, CONTENT_WIDTH);
  doc.text(waiverLines, MARGIN, y);
  y += waiverLines.length * 12 + 16;

  y = rule(doc, y);
  y += 14;

  // Signature block
  text(doc, "Claimant's Signature:", MARGIN, y, { bold: true, size: 9.5, color: LABEL_GRAY });
  doc.setDrawColor("#000000");
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 120, y + 2, MARGIN + 360, y + 2);
  y += 20;

  text(doc, "Printed Name & Title:", MARGIN, y, { bold: true, size: 9.5, color: LABEL_GRAY });
  doc.line(MARGIN + 120, y + 2, MARGIN + 360, y + 2);
  y += 20;

  text(doc, "Date:", MARGIN, y, { bold: true, size: 9.5, color: LABEL_GRAY });
  doc.line(MARGIN + 120, y + 2, MARGIN + 280, y + 2);

  const filename = `${job.jobNumber}-retention-release-${release.releaseNumber}.pdf`;
  doc.save(filename);
}
