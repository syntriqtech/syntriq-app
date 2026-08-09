// Helpers for normalizing raw cell values from a Yellowcard workbook.
// Excel stores phones as integers, dates as serials, percentages as fractions —
// these helpers standardize all of them.

export function cleanString(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "-" || s === "–" ? "" : s;
}

// Uses the Excel-formatted value (cell.w) when available; falls back to
// manually formatting the raw numeric value.
export function cleanPhone(cell: { v: unknown; w?: string }): string {
  const formatted = (cell.w ?? "").trim();
  if (formatted && formatted !== "-") return formatted;
  if (typeof cell.v === "number") {
    const s = String(Math.round(Math.abs(cell.v)));
    if (s.length === 10) return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`;
    return s;
  }
  return cleanString(cell.v);
}

// Excel serial dates: day 1 = Jan 1 1900. Unix epoch (Jan 1 1970) = Excel
// serial 25569, so subtract 25569 and multiply by 86400s to get a Unix
// timestamp. This matches the w-formatted value in the workbook.
export function cleanDate(v: unknown): string {
  if (!v && v !== 0) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 0) {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "";
}

export function cleanNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(/[$,\s%]/g, "")) || 0;
  return 0;
}

// Yellowcard stores retention as a whole number (5 = 5%) but OH&P and CO rate
// as fractions (0.15 = 15%). This normalizes both to whole-number percent.
export function cleanPercent(v: unknown): number {
  const n = cleanNumber(v);
  return n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n);
}
