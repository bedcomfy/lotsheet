// The "Total Fleet PM Status Report" that the garage's maintenance system
// prints: one line per open PM work order with the bus, miles since / until
// the inspection, the activity (PM-A 15000 MILES, TRANS P.M. 75000, …), the
// work order number, the current mileage and the mileage the inspection is
// due at. The scans come through with an OCR text layer, so the report can
// be read without any AI: this module turns positioned text into lines,
// lines into rows, and rows into one record per bus. Pure — no PDF library
// here, so it is unit-testable; pmReportPdf.ts feeds it from pdf.js.

import { INSPECTION_CYCLE, TRANS_PM_INTERVAL, type InspectionType } from "./pmMileage";

export interface PositionedText {
  text: string;
  x: number;
  y: number;
  dirX: number; // unit vector along the reading direction
  dirY: number;
}

export interface PmReportRow {
  bus: string;
  milesSince: number;
  milesUntil: number;
  interval: number; // milesSince + milesUntil: 3,000 for inspections, 75,000 for trans
  activity: string;
  mark: number | null; // the PM mark in miles (15000 for "PM-A 15000 MILES"), inspections only
  workOrder: string | null;
  current: number; // odometer
  dueAt: number;
  page: number;
}

export interface PmReportBus {
  bus: string;
  odometer: number;
  nextInspType: InspectionType | null;
  nextInspDue: number | null;
  lastInspType: InspectionType | null;
  lastInspMiles: number | null;
  transDue: number | null;
  lastTransMiles: number | null;
  note: string | null; // anything odd (rows disagree, unknown PM mark)
  pages: number[];
}

export interface PmReportParse {
  rows: PmReportRow[];
  buses: PmReportBus[];
  reportDate: string | null;
  lineCount: number; // reconstructed lines, for the "how much did we read" figure
}

const INSPECTION_INTERVAL = 3000;
const ROW_TOLERANCE = 4.5; // points; report rows are ~13pt apart

// Group positioned text into reading lines regardless of page rotation: each
// item is projected onto its reading direction (column position) and the
// perpendicular (row position); items with the same row position are a line.
export function linesFromText(items: PositionedText[]): string[] {
  const keyed = items
    .filter((it) => it.text.trim())
    .map((it) => ({
      text: it.text.trim(),
      // Perpendicular to the reading direction, signed so lines come out in
      // page order (top of the page first) for upright and rotated text alike.
      row: it.x * it.dirY - it.y * it.dirX,
      col: it.x * it.dirX + it.y * it.dirY,
    }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const lines: string[] = [];
  let bucket: typeof keyed = [];
  let anchor: number | null = null;
  const flush = () => {
    if (bucket.length) lines.push(bucket.sort((a, b) => a.col - b.col).map((k) => k.text).join(" "));
    bucket = [];
  };
  for (const item of keyed) {
    if (anchor === null || Math.abs(item.row - anchor) <= ROW_TOLERANCE) {
      bucket.push(item);
      if (anchor === null) anchor = item.row;
    } else {
      flush();
      bucket = [item];
      anchor = item.row;
    }
  }
  flush();
  return lines;
}

// Common OCR slips in this report's typeface.
function cleanLine(line: string): string {
  return line
    .replace(/M\s*[lI1|]\s*LES/gi, "MILES")
    .replace(/MI\s*[lI1|]\s*E\s*AGE/gi, "MILEAGE")
    .replace(/PM\s*[-–—]?\s*8\b/g, "PM-B")
    .replace(/PM\s*[-–—]?\s*([ABC])\b/gi, (_, l: string) => `PM-${l.toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}

const ROW_RE =
  /(?<![\d,.])(\d{4,5})\s+(-?\d[\d,]*)\s+(-?\d[\d,]*)\s+(PM-([ABC])\s*(\d{4,5})\s*MILES|TRANS\s*P\.?\s*M\.?\s*75000|CHANGE\s+(?:FRONT\s+HUB|DIFFERENTIAL)(?:\s+FLUID)?)\s*(\d{7})?\s*(\d[\d,]*)\s+(\d[\d,]*)/i;

const num = (s: string) => Number(s.replace(/,/g, ""));

// One report line → a row, or null when it isn't one or doesn't add up. The
// arithmetic checks (since + until = the interval; current + until = due at)
// are what keep OCR noise out: a misread digit breaks one of them.
export function parseReportLine(line: string, page = 1): PmReportRow | null {
  const m = ROW_RE.exec(cleanLine(line));
  if (!m) return null;
  const [, bus, since, until, activity, , markText, workOrder, current, dueAt] = m;
  const row: PmReportRow = {
    bus,
    milesSince: num(since),
    milesUntil: num(until),
    interval: num(since) + num(until),
    activity: activity.replace(/\s+/g, " ").trim().toUpperCase(),
    mark: markText ? num(markText) : null,
    workOrder: workOrder || null,
    current: num(current),
    dueAt: num(dueAt),
    page,
  };
  if (![row.milesSince, row.milesUntil, row.current, row.dueAt].every(Number.isFinite)) return null;
  if (row.current + row.milesUntil !== row.dueAt) return null;
  if (row.mark !== null) {
    if (row.interval !== INSPECTION_INTERVAL) return null;
    if (!markToType(row.mark)) return null;
  } else if (row.interval !== TRANS_PM_INTERVAL) {
    return null;
  }
  return row;
}

// "15000" → "A-15" via the cycle's marks (3,000 → A-3 … 24,000 → C-24).
export function markToType(mark: number): InspectionType | null {
  const found = INSPECTION_CYCLE.find((type) => Number(type.split("-")[1]) * 1000 === mark);
  return found ?? null;
}

function previousType(type: InspectionType): InspectionType {
  const i = INSPECTION_CYCLE.indexOf(type);
  return INSPECTION_CYCLE[(i - 1 + INSPECTION_CYCLE.length) % INSPECTION_CYCLE.length];
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// "30/SEP/2026" (the report header) → "9/30/26".
export function reportDateFromText(text: string): string | null {
  const m = /(\d{1,2})\/([A-Z]{3})\/(\d{4})/i.exec(text);
  if (!m) return null;
  const month = MONTHS[m[2].toUpperCase()];
  if (!month) return null;
  return `${month}/${Number(m[1])}/${m[3].slice(-2)}`;
}

// Rows → one record per bus. Several work orders print the same inspection
// line, so duplicates are expected; rows that disagree on the current
// mileage keep the highest and say so.
export function summarizeReportRows(rows: PmReportRow[]): PmReportBus[] {
  const byBus = new Map<string, PmReportRow[]>();
  for (const row of rows) byBus.set(row.bus, [...(byBus.get(row.bus) || []), row]);
  const out: PmReportBus[] = [];
  for (const [bus, list] of byBus) {
    const odometer = Math.max(...list.map((r) => r.current));
    const notes: string[] = [];
    if (new Set(list.map((r) => r.current)).size > 1) notes.push("rows disagree on the current mileage; kept the highest");
    const latestForKind = (inspection: boolean) => {
      const candidates = list.filter((r) => (r.mark !== null) === inspection);
      const latest = Math.max(...candidates.map((r) => r.current));
      return candidates.filter((r) => r.current === latest);
    };
    const insp = latestForKind(true);
    const trans = latestForKind(false);
    let nextInspType: InspectionType | null = null;
    let nextInspDue: number | null = null;
    if (insp.length) {
      const marks = new Set(insp.map((r) => r.mark));
      if (marks.size > 1) notes.push("more than one inspection type listed");
      const soonest = insp.reduce((a, b) => (b.dueAt < a.dueAt ? b : a));
      nextInspType = markToType(soonest.mark as number);
      nextInspDue = soonest.dueAt;
    }
    let transDue: number | null = null;
    if (trans.length) transDue = Math.min(...trans.map((r) => r.dueAt));
    out.push({
      bus,
      odometer,
      nextInspType,
      nextInspDue,
      lastInspType: nextInspType ? previousType(nextInspType) : null,
      lastInspMiles: nextInspDue === null ? null : nextInspDue - INSPECTION_INTERVAL,
      transDue,
      lastTransMiles: transDue === null ? null : transDue - TRANS_PM_INTERVAL,
      note: notes.length ? notes.join("; ") : null,
      pages: [...new Set(list.map((r) => r.page))].sort((a, b) => a - b),
    });
  }
  return out.sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true }));
}

// Whole document: positioned text per page → rows, per-bus records, date.
export function parsePmReport(pages: PositionedText[][]): PmReportParse {
  const rows: PmReportRow[] = [];
  let reportDate: string | null = null;
  let lineCount = 0;
  pages.forEach((items, index) => {
    const lines = linesFromText(items);
    lineCount += lines.length;
    for (const line of lines) {
      if (!reportDate) reportDate = reportDateFromText(line);
      const row = parseReportLine(line, index + 1);
      if (row) rows.push(row);
    }
  });
  return { rows, buses: summarizeReportRows(rows), reportDate, lineCount };
}
