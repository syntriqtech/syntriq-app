import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import FormulaParser from "fast-formula-parser";

// Turns selected sheets of a (filled-in) Excel workbook into a PDF that looks
// like the sheets do in Excel: same columns, merged cells, fills, borders,
// fonts, number formats and logo. Used for "CTI Billing Form PDF" so the
// client gets the same document the Excel billing form produces, without
// needing Excel (or a server-side spreadsheet converter) to print it.
//
// Two steps: (1) work out every formula's value ourselves — the workbook has
// only simple IF/SUM/arithmetic formulas, and exceljs doesn't calculate;
// (2) draw each sheet's cells onto a page, scaled to fit.

type Cell = ExcelJS.Cell;
type Ws = ExcelJS.Worksheet;

const PX_TO_PT = 0.75;

// ───────────────────────── Formula evaluation ─────────────────────────

function dateToSerial(d: Date): number {
  return Math.round(d.getTime() / 86400000 + 25569);
}

function serialToDate(n: number): Date {
  return new Date(Math.round((n - 25569) * 86400000));
}

type Scalar = string | number | boolean | Date | null;

function makeEvaluator(workbook: ExcelJS.Workbook) {
  const cache = new Map<string, Scalar>();
  const inProgress = new Set<string>();

  function raw(sheetName: string, row: number, col: number): Scalar {
    const key = `${sheetName}!${row}:${col}`;
    if (cache.has(key)) return cache.get(key) as Scalar;
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return null;
    const cell = sheet.getCell(row, col);
    let value: Scalar = null;
    const v = cell.value as unknown;
    if (v && typeof v === "object" && !(v instanceof Date) && ("formula" in v || "sharedFormula" in v)) {
      const cached = (v as { result?: unknown }).result;
      const formula = cell.formula;
      if (!formula) {
        value = (cached as Scalar) ?? null;
      } else if (inProgress.has(key)) {
        value = 0; // circular reference — shouldn't happen in this workbook
      } else {
        inProgress.add(key);
        try {
          // A fresh parser per formula: one parser can't safely be re-entered while
          // a formula it is evaluating asks for another formula's value.
          const out = newParser().parse(formula, { sheet: sheetName, row, col }) as unknown;
          value = out instanceof Error || (out && typeof out === "object" && "error" in (out as object))
            ? String((out as { error?: string }).error ?? "#ERROR")
            : (out as Scalar);
        } catch {
          value = (cached as Scalar) ?? null;
        }
        inProgress.delete(key);
      }
    } else if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { richText?: { text: string }[]; text?: unknown; error?: string };
      if (o.richText) value = o.richText.map((r) => r.text).join("");
      else if (o.error) value = o.error;
      else if (o.text !== undefined) value = String(o.text);
    } else {
      value = v as Scalar;
    }
    cache.set(key, value);
    return value;
  }

  // Formulas see dates as Excel serial numbers, like Excel does.
  const forFormula = (v: Scalar) => (v instanceof Date ? dateToSerial(v) : v);

  const newParser = () => new FormulaParser({
    onCell: (ref: { sheet?: string; row: number; col: number }) =>
      forFormula(raw(ref.sheet ?? "", ref.row, ref.col)),
    onRange: (ref: { sheet?: string; from: { row: number; col: number }; to: { row: number; col: number } }) => {
      const out: Scalar[][] = [];
      for (let r = ref.from.row; r <= ref.to.row; r++) {
        const rowVals: Scalar[] = [];
        for (let c = ref.from.col; c <= ref.to.col; c++) rowVals.push(forFormula(raw(ref.sheet ?? "", r, c)));
        out.push(rowVals);
      }
      return out;
    },
  });

  return (sheetName: string, row: number, col: number) => raw(sheetName, row, col);
}

// ───────────────────────── Number formats ─────────────────────────

type Formatted = { text: string; red: boolean };

function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  let inBracket = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === "\\" && !inQuote) {
      cur += ch + (fmt[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === "[") inBracket = true;
    else if (!inQuote && ch === "]") inBracket = false;
    if (ch === ";" && !inQuote && !inBracket) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

type Token = { kind: "lit"; text: string } | { kind: "digit"; ch: string } | { kind: "point" } | { kind: "comma" } | { kind: "text" };

function tokenize(section: string) {
  const tokens: Token[] = [];
  let red = false;
  let percent = 0;
  let isDate = false;
  let condition: { op: string; num: number } | null = null;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      tokens.push({ kind: "lit", text: section.slice(i + 1, end < 0 ? undefined : end) });
      i = end < 0 ? section.length : end;
    } else if (ch === "\\") {
      tokens.push({ kind: "lit", text: section[i + 1] ?? "" });
      i++;
    } else if (ch === "_") {
      tokens.push({ kind: "lit", text: " " });
      i++;
    } else if (ch === "*") {
      i++; // fill character — ignored
    } else if (ch === "[") {
      const end = section.indexOf("]", i);
      const inner = section.slice(i + 1, end < 0 ? undefined : end);
      if (/^red$/i.test(inner)) red = true;
      const cond = inner.match(/^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/);
      if (cond) condition = { op: cond[1], num: Number(cond[2]) };
      const cur = inner.match(/^\$([^-\]]*)/);
      if (cur) tokens.push({ kind: "lit", text: cur[1] });
      i = end < 0 ? section.length : end;
    } else if (ch === "0" || ch === "#" || ch === "?") tokens.push({ kind: "digit", ch });
    else if (ch === ".") tokens.push({ kind: "point" });
    else if (ch === ",") tokens.push({ kind: "comma" });
    else if (ch === "%") {
      percent++;
      tokens.push({ kind: "lit", text: "%" });
    } else if (ch === "@") tokens.push({ kind: "text" });
    else if (/[ymdhs]/i.test(ch)) {
      isDate = true;
      tokens.push({ kind: "lit", text: ch });
    } else tokens.push({ kind: "lit", text: ch });
  }
  return { tokens, red, percent, isDate, condition };
}

function conditionMet(c: { op: string; num: number }, n: number) {
  switch (c.op) {
    case "<": return n < c.num;
    case "<=": return n <= c.num;
    case ">": return n > c.num;
    case ">=": return n >= c.num;
    case "=": return n === c.num;
    default: return n !== c.num;
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  // Numeric MM/DD/YYYY everywhere, matching the app's other generated PDFs.
  return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}/${d.getUTCFullYear()}`;
}

function formatNumberSection(value: number, tokens: Token[], percent: number, forceAbs: boolean): string {
  let n = forceAbs ? Math.abs(value) : value;
  if (percent) n *= Math.pow(100, percent);
  const neg = n < 0;
  const abs = Math.abs(n);

  const pointIdx = tokens.findIndex((t) => t.kind === "point");
  const intTokens = pointIdx < 0 ? tokens : tokens.slice(0, pointIdx);
  const decTokens = pointIdx < 0 ? [] : tokens.slice(pointIdx + 1);
  const decDigits = decTokens.filter((t) => t.kind === "digit") as { kind: "digit"; ch: string }[];
  const requiredDec = decDigits.filter((t) => t.ch === "0").length;
  const maxDec = decDigits.length;

  const fixed = abs.toFixed(maxDec);
  let [intStr, decStr = ""] = fixed.split(".");
  while (decStr.length > requiredDec && decStr.endsWith("0")) decStr = decStr.slice(0, -1);

  const intPlaceholders = intTokens.filter((t) => t.kind === "digit") as { kind: "digit"; ch: string }[];
  const minInt = intPlaceholders.filter((t) => t.ch === "0").length;
  if (intStr === "0" && minInt === 0) intStr = "";
  intStr = intStr.padStart(minInt, "0");

  const hasComma = intTokens.some((t) => t.kind === "comma") &&
    intTokens.findIndex((t) => t.kind === "comma") > intTokens.findIndex((t) => t.kind === "digit");
  // Digits split by literals (e.g. a phone format ###-####) are filled right to left.
  const firstDigit = intTokens.findIndex((t) => t.kind === "digit");
  const lastDigit = intTokens.length - 1 - [...intTokens].reverse().findIndex((t) => t.kind === "digit");
  const spread = firstDigit >= 0 && intTokens.slice(firstDigit, lastDigit + 1).some((t) => t.kind === "lit");

  let intOut: string;
  if (spread) {
    let remaining = intStr;
    const parts: string[] = [];
    for (let i = intTokens.length - 1; i >= 0; i--) {
      const t = intTokens[i];
      if (t.kind === "lit") parts.unshift(t.text);
      else if (t.kind === "digit") {
        if (remaining.length > 0) {
          const take = i === firstDigit ? remaining : remaining.slice(-1);
          parts.unshift(take);
          remaining = i === firstDigit ? "" : remaining.slice(0, -1);
        } else if (t.ch === "0") parts.unshift("0");
        else if (t.ch === "?") parts.unshift(" ");
      }
    }
    intOut = parts.join("");
  } else {
    let digits = intStr;
    if (hasComma) digits = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const parts: string[] = [];
    let placed = false;
    for (const t of intTokens) {
      if (t.kind === "digit") {
        if (!placed) {
          parts.push(digits);
          placed = true;
        }
      } else if (t.kind === "lit") parts.push(t.text);
    }
    if (!placed) parts.push(digits);
    intOut = parts.join("");
  }

  let out = intOut;
  if (pointIdx >= 0) {
    const decLiterals = decTokens.filter((t) => t.kind === "lit") as { kind: "lit"; text: string }[];
    const suffix = decLiterals.map((t) => t.text).join("");
    out += (decStr.length ? "." + decStr : "") + suffix;
  }
  const isZeroDisplay = /^[0.,]*$/.test(intStr + decStr);
  return (neg && !forceAbs && !isZeroDisplay ? "-" : "") + out;
}

function formatValue(value: Scalar, numFmt: string | undefined): Formatted {
  if (value === null || value === undefined || value === "") return { text: "", red: false };
  if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE", red: false };

  const fmt = numFmt && numFmt !== "General" ? numFmt : "General";
  const sections = splitSections(fmt);

  if (typeof value === "string") {
    const textSection = sections.find((s) => s.includes("@"));
    if (!textSection) return { text: value, red: false };
    const { tokens, red } = tokenize(textSection);
    return { text: tokens.map((t) => (t.kind === "text" ? value : t.kind === "lit" ? t.text : "")).join(""), red };
  }

  const isDateValue = value instanceof Date;
  const n = isDateValue ? dateToSerial(value as Date) : (value as number);

  // Pick the section: explicit conditions first, else positive / negative / zero.
  const parsed = sections.map(tokenize);
  let idx = 0;
  let forceAbs = false;
  if (parsed.some((p) => p.condition)) {
    idx = parsed.findIndex((p) => p.condition && conditionMet(p.condition, n));
    if (idx < 0) idx = parsed.length - 1;
  } else if (parsed.length >= 2) {
    if (n < 0) {
      idx = 1;
      forceAbs = true;
    } else if (n === 0 && parsed.length >= 3) idx = 2;
  }
  const section = parsed[idx];
  const sectionStr = sections[idx];

  if (sectionStr.trim() === "") return { text: "", red: false };

  if (section.isDate || isDateValue) {
    const d = isDateValue ? (value as Date) : serialToDate(n);
    if (Number.isNaN(d.getTime())) return { text: "", red: false };
    return { text: formatDate(d), red: false };
  }

  if (fmt === "General") {
    // Excel's General: up to ~10 significant digits, no trailing zeros.
    const rounded = Math.round(n * 1e9) / 1e9;
    return { text: String(rounded), red: false };
  }

  return { text: formatNumberSection(n, section.tokens, section.percent, forceAbs), red: section.red };
}

// ───────────────────────── Colors ─────────────────────────

const DEFAULT_THEME = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"];

function themePalette(workbook: ExcelJS.Workbook): string[] {
  const xml = (workbook as unknown as { _themes?: Record<string, string> })._themes?.theme1;
  if (!xml) return DEFAULT_THEME;
  // Excel's theme index order: lt1, dk1, lt2, dk2, accent1..6
  const names = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
  const colors = names.map((n, i) => {
    const m = xml.match(new RegExp(`<a:${n}>([\\s\\S]*?)</a:${n}>`));
    if (!m) return DEFAULT_THEME[i];
    const c = m[1].match(/lastClr="([0-9A-Fa-f]{6})"/) ?? m[1].match(/val="([0-9A-Fa-f]{6})"/);
    return c ? c[1] : DEFAULT_THEME[i];
  });
  return colors;
}

function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let rr = l, gg = l, bb = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = hue2rgb(p, q, h + 1 / 3);
    gg = hue2rgb(p, q, h);
    bb = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0");
  return to(rr) + to(gg) + to(bb);
}

const INDEXED: Record<number, string> = { 8: "000000", 9: "FFFFFF", 10: "FF0000", 11: "00FF00", 12: "0000FF", 13: "FFFF00", 64: "000000" };

function resolveColor(color: Partial<ExcelJS.Color> | undefined, palette: string[]): [number, number, number] | null {
  if (!color) return null;
  let hex: string | null = null;
  if (color.argb) hex = color.argb.slice(-6);
  else if (typeof color.theme === "number") hex = palette[color.theme] ?? null;
  else if ((color as { indexed?: number }).indexed !== undefined) hex = INDEXED[(color as { indexed: number }).indexed] ?? null;
  if (!hex) return null;
  if (typeof color.theme === "number" && (color as { tint?: number }).tint) hex = applyTint(hex, (color as { tint: number }).tint);
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

// ───────────────────────── Drawing ─────────────────────────

function colWidthPt(ws: Ws, col: number): number {
  const c = ws.getColumn(col);
  if (c.hidden) return 0;
  const w = c.width ?? 8.43;
  return Math.trunc(w * 7 + 5) * PX_TO_PT;
}

function rowHeightPt(ws: Ws, row: number): number {
  const r = ws.getRow(row);
  if (r.hidden) return 0;
  return r.height ?? ws.properties.defaultRowHeight ?? 15;
}

function fontFor(name: string | undefined): "helvetica" | "times" | "courier" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("times") || n.includes("cambria") || n.includes("georgia")) return "times";
  if (n.includes("courier") || n.includes("consolas")) return "courier";
  return "helvetica";
}

type Border = Partial<ExcelJS.Border> | undefined;

function drawBorder(
  doc: jsPDF,
  b: Border,
  palette: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  scale: number
) {
  if (!b || !b.style) return;
  const rgb = resolveColor(b.color, palette) ?? [0, 0, 0];
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  const widths: Record<string, number> = { hair: 0.25, thin: 0.5, dotted: 0.5, dashed: 0.5, dashDot: 0.5, dashDotDot: 0.5, medium: 1, mediumDashed: 1, mediumDashDot: 1, mediumDashDotDot: 1, slantDashDot: 1, thick: 1.75, double: 1.25 };
  doc.setLineWidth(Math.max(0.3, (widths[b.style] ?? 0.5) * scale));
  if (b.style === "dotted" || b.style === "hair") doc.setLineDashPattern([1 * scale, 1 * scale], 0);
  else if (b.style.includes("dash") || b.style.includes("Dash")) doc.setLineDashPattern([3 * scale, 2 * scale], 0);
  else doc.setLineDashPattern([], 0);
  doc.line(x1, y1, x2, y2);
  doc.setLineDashPattern([], 0);
}

type MergeRect = { r1: number; c1: number; r2: number; c2: number };

function sheetMerges(ws: Ws): MergeRect[] {
  const merges = (ws.model as unknown as { merges?: string[] }).merges ?? [];
  return merges.map((ref) => {
    const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
    const colNum = (s: string) => s.split("").reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
    return { c1: colNum(m[1]), r1: Number(m[2]), c2: colNum(m[3]), r2: Number(m[4]) };
  });
}

// Used range: last row/col that holds anything visible (value, fill or border).
function usedBounds(ws: Ws): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    row.eachCell({ includeEmpty: false }, (cell, cn) => {
      const hasValue = cell.value !== null && cell.value !== undefined && cell.value !== "";
      const b = cell.border;
      const hasBorder = !!b && !!(b.top?.style || b.bottom?.style || b.left?.style || b.right?.style);
      const hasFill = cell.fill && cell.fill.type === "pattern" && (cell.fill as ExcelJS.FillPattern).pattern === "solid";
      if (hasValue || hasBorder || hasFill) {
        rows = Math.max(rows, rn);
        cols = Math.max(cols, cn);
      }
    });
  });
  return { rows, cols };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function drawSheet(
  doc: jsPDF,
  workbook: ExcelJS.Workbook,
  ws: Ws,
  getValue: (sheet: string, row: number, col: number) => Scalar,
  palette: string[],
  first: boolean
) {
  const printArea = ws.pageSetup.printArea as string | undefined;
  let lastRow: number;
  let lastCol: number;
  if (printArea) {
    const m = printArea.match(/\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/);
    lastCol = m![3].split("").reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
    lastRow = Number(m![4]);
  } else {
    const used = usedBounds(ws);
    lastRow = used.rows;
    lastCol = used.cols;
  }

  const landscape = ws.pageSetup.orientation === "landscape";
  const pageW = landscape ? 792 : 612;
  const pageH = landscape ? 612 : 792;
  const margin = 28;
  if (first) {
    // The document was created with the first sheet's orientation (see caller).
  } else doc.addPage([pageW, pageH], landscape ? "landscape" : "portrait");

  const colX: number[] = [0];
  for (let c = 1; c <= lastCol; c++) colX[c] = colX[c - 1] + colWidthPt(ws, c);
  const rowY: number[] = [0];
  for (let r = 1; r <= lastRow; r++) rowY[r] = rowY[r - 1] + rowHeightPt(ws, r);
  const totalW = colX[lastCol];
  const totalH = rowY[lastRow];

  const scale = Math.min((pageW - margin * 2) / totalW, (pageH - margin * 2) / totalH, 1.5);
  const ox = (pageW - totalW * scale) / 2;
  const oy = margin;
  const X = (c: number) => ox + colX[c - 1] * scale; // left edge of column c
  const Y = (r: number) => oy + rowY[r - 1] * scale; // top edge of row r

  const merges = sheetMerges(ws).filter((m) => m.r1 <= lastRow && m.c1 <= lastCol);
  const mergeAt = new Map<string, MergeRect>();
  const mergeCovered = new Set<string>();
  for (const m of merges) {
    mergeAt.set(`${m.r1}:${m.c1}`, m);
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) mergeCovered.add(`${r}:${c}`);
  }

  const rectFor = (r: number, c: number) => {
    const m = mergeAt.get(`${r}:${c}`);
    const r2 = Math.min(m?.r2 ?? r, lastRow);
    const c2 = Math.min(m?.c2 ?? c, lastCol);
    return { x: X(c), y: Y(r), w: X(c2 + 1 > lastCol + 1 ? lastCol + 1 : c2 + 1) - X(c), h: Y(r2 + 1) - Y(r), r2, c2 };
  };
  // Right/bottom edges need one-past indices; extend arrays by one.
  colX[lastCol + 1] = colX[lastCol];
  rowY[lastRow + 1] = rowY[lastRow];

  // Pass 1 — fills.
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      if (mergeCovered.has(`${r}:${c}`)) continue;
      const cell = ws.getCell(r, c);
      const fill = cell.fill as ExcelJS.FillPattern | undefined;
      if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") continue;
      const rgb = resolveColor(fill.fgColor, palette);
      if (!rgb) continue;
      const rect = rectFor(r, c);
      if (rect.w <= 0 || rect.h <= 0) continue;
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(rect.x, rect.y, rect.w, rect.h, "F");
    }
  }

  // Pass 2 — text.
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      if (mergeCovered.has(`${r}:${c}`)) continue;
      const cell: Cell = ws.getCell(r, c);
      const value = getValue(ws.name, r, c);
      const { text, red } = formatValue(value, cell.numFmt);
      if (!text) continue;
      const rect = rectFor(r, c);
      if (rect.w <= 0 || rect.h <= 0) continue;

      const font = cell.font ?? {};
      const align = cell.alignment ?? {};
      const baseSize = (font.size ?? 11) * scale;
      const style = font.bold && font.italic ? "bolditalic" : font.bold ? "bold" : font.italic ? "italic" : "normal";
      doc.setFont(fontFor(font.name), style);
      const rgb = red ? ([192, 0, 0] as [number, number, number]) : resolveColor(font.color, palette) ?? [0, 0, 0];
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);

      const isNumber = typeof value === "number" || value instanceof Date;
      const horizontal = align.horizontal && (align.horizontal as string) !== "general" ? align.horizontal : isNumber ? "right" : "left";
      const pad = 2 * scale;
      const indent = (align.indent ?? 0) * 6 * scale;
      let size = baseSize;
      doc.setFontSize(size);

      const wrap = !!align.wrapText;
      const boxX = rect.x;
      let boxW = rect.w;
      let lines: string[];

      if (wrap) {
        const availW = Math.max(1, boxW - pad * 2 - indent);
        // Never split a word across lines: shrink a little until the longest word fits.
        const longestWord = () => Math.max(...text.split(/\s+/).map((w) => doc.getTextWidth(w)));
        while (longestWord() > availW && size > baseSize * 0.7) {
          size -= 0.25;
          doc.setFontSize(size);
        }
        lines = doc.splitTextToSize(text, availW) as string[];
        // Long wrapped text in a fixed-height row: shrink until it fits, like a person would.
        while (lines.length * size * 1.15 > rect.h && size > baseSize * 0.55) {
          size -= 0.25;
          doc.setFontSize(size);
          lines = doc.splitTextToSize(text, Math.max(1, boxW - pad * 2 - indent)) as string[];
        }
      } else {
        // Text spills into empty neighbours (like Excel); otherwise shrink to fit.
        {
          const textW = doc.getTextWidth(text);
          let extra = 0;
          // A cell with a border on its right edge is a box: text stays inside it (shrinking
          // if needed) instead of spilling past the line into the next cell.
          const boxed = !!ws.getCell(r, rect.c2).border?.right?.style;
          if (!boxed && textW > boxW - pad * 2 && (horizontal === "left" || horizontal === "right" || horizontal === "center")) {
            let cc = rect.c2 + 1;
            while (cc <= lastCol && textW > boxW + extra - pad * 2) {
              const v = getValue(ws.name, r, cc);
              if (v !== null && v !== undefined && v !== "") break;
              extra += colX[cc] - colX[cc - 1];
              cc++;
            }
            if (horizontal === "left") boxW += extra * scale;
          }
          while (doc.getTextWidth(text) > boxW - pad * 2 && size > baseSize * 0.5) {
            size -= 0.25;
            doc.setFontSize(size);
          }
        }
        lines = [text];
      }

      const lineH = size * 1.15;
      const blockH = lines.length * lineH;
      const vertical = align.vertical ?? "bottom";
      let top: number;
      if (vertical === "top") top = rect.y + 1 * scale;
      else if (vertical === "middle" || (vertical as string) === "center") top = rect.y + (rect.h - blockH) / 2;
      else top = rect.y + rect.h - blockH - 1 * scale;

      lines.forEach((line, i) => {
        const y = top + i * lineH + size * 0.85; // baseline
        let x: number;
        let opts: { align?: "left" | "center" | "right" } = {};
        if (horizontal === "center" || horizontal === "centerContinuous") {
          x = boxX + boxW / 2;
          opts = { align: "center" };
        } else if (horizontal === "right") {
          x = boxX + boxW - pad;
          opts = { align: "right" };
        } else {
          x = boxX + pad + indent;
        }
        doc.text(line, x, y, opts);
        if (font.underline) {
          const w = doc.getTextWidth(line);
          const sx = opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x;
          doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
          doc.setLineWidth(0.4 * scale);
          doc.line(sx, y + 1, sx + w, y + 1);
        }
      });
    }
  }

  // Pass 3 — borders (drawn last so fills never cover them).
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      if (mergeCovered.has(`${r}:${c}`)) continue;
      const m = mergeAt.get(`${r}:${c}`);
      const r2 = Math.min(m?.r2 ?? r, lastRow);
      const c2 = Math.min(m?.c2 ?? c, lastCol);
      const bTop = ws.getCell(r, c).border?.top;
      const bLeft = ws.getCell(r, c).border?.left;
      const bBottom = ws.getCell(r2, c).border?.bottom ?? ws.getCell(r2, c2).border?.bottom;
      const bRight = ws.getCell(r, c2).border?.right ?? ws.getCell(r2, c2).border?.right;
      const x1 = X(c);
      const y1 = Y(r);
      const x2 = ox + colX[c2] * scale;
      const y2 = oy + rowY[r2] * scale;
      if (x2 <= x1 || y2 <= y1) continue;
      drawBorder(doc, bTop, palette, x1, y1, x2, y1, scale);
      drawBorder(doc, bLeft, palette, x1, y1, x1, y2, scale);
      drawBorder(doc, bBottom, palette, x1, y2, x2, y2, scale);
      drawBorder(doc, bRight, palette, x2, y1, x2, y2, scale);
    }
  }

  // Images (the logo).
  for (const img of ws.getImages()) {
    const m = workbook.getImage(Number(img.imageId)) as unknown as { buffer: Uint8Array; extension: string } | undefined;
    if (!m) continue;
    const tl = img.range.tl as unknown as { nativeCol: number; nativeRow: number; nativeColOff: number; nativeRowOff: number };
    const br = img.range.br as unknown as { nativeCol: number; nativeRow: number; nativeColOff: number; nativeRowOff: number } | undefined;
    const ext = (img.range as unknown as { ext?: { width: number; height: number } }).ext;
    const px = (emu: number) => (emu / 9525) * PX_TO_PT;
    const colEdge = (col: number, off: number) => {
      const cc = Math.min(Math.max(col + 1, 1), lastCol + 1);
      return ox + colX[cc - 1] * scale + px(off) * scale;
    };
    const rowEdge = (row: number, off: number) => {
      const rr = Math.min(Math.max(row + 1, 1), lastRow + 1);
      return oy + rowY[rr - 1] * scale + px(off) * scale;
    };
    const x = colEdge(tl.nativeCol, tl.nativeColOff);
    const y = rowEdge(tl.nativeRow, tl.nativeRowOff);
    let w: number;
    let h: number;
    if (br) {
      w = colEdge(br.nativeCol, br.nativeColOff) - x;
      h = rowEdge(br.nativeRow, br.nativeRowOff) - y;
    } else if (ext) {
      w = ext.width * PX_TO_PT * scale;
      h = ext.height * PX_TO_PT * scale;
    } else continue;
    // Some pictures in the workbook are anchored with zero height — Excel never shows them.
    if (w < 2 || h < 2) continue;
    const fmt = m.extension.toLowerCase() === "png" ? "PNG" : "JPEG";
    try {
      doc.addImage(`data:image/${fmt.toLowerCase()};base64,${bytesToBase64(new Uint8Array(m.buffer))}`, fmt, x, y, w, h);
    } catch {
      // A logo that can't be embedded shouldn't block the whole PDF.
    }
  }
}

export async function renderWorkbookSheetsToPdf(workbookBuffer: ArrayBuffer, sheetNames: string[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(workbookBuffer as any);

  const getValue = makeEvaluator(workbook);
  const palette = themePalette(workbook);

  const sheets = sheetNames.map((n) => {
    const ws = workbook.getWorksheet(n);
    if (!ws) throw new Error(`Template is missing expected sheet "${n}".`);
    return ws;
  });

  const firstLandscape = sheets[0].pageSetup.orientation === "landscape";
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: firstLandscape ? "landscape" : "portrait" });
  sheets.forEach((ws, i) => drawSheet(doc, workbook, ws, getValue, palette, i === 0));

  return new Uint8Array(doc.output("arraybuffer"));
}
