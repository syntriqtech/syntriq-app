/**
 * Format a YYYY-MM-DD or ISO datetime string as MM/DD/YYYY for display.
 * Pure string manipulation — no Date object, so no timezone-offset issues.
 * Returns "—" for null/undefined/empty inputs.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateStr = value.slice(0, 10); // works for both "YYYY-MM-DD" and ISO timestamps
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return value;
  return `${m}/${d}/${y}`;
}
