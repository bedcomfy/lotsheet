// The "Vehicles Monthly Miles to Date Report (with last odometer)" from the
// garage's fleet system: one line per vehicle with the zero-padded number,
// division, optional department, the life-to-date odometer, MPG, and the
// period's miles / fuel / oil / coolant / ATF. A "*" after the odometer
// means the vehicle wasn't serviced in the period, so the figure is simply
// its latest reading. Native text, so it reads exactly. Pure — fed from the
// same positioned-text lines as the PM status report.

import { linesFromText, type PositionedText } from "./pmReport";

export interface OdometerReportRow {
  bus: string; // leading zeros stripped: "002770" → "2770"
  division: string;
  dept: string | null;
  odometer: number; // miles, to the tenth
  mpg: number | null;
  milesRun: number | null;
  notServiced: boolean; // the report's "*"
  page: number;
  readAt?: string | null; // a per-row reading date (m/d/yy) when the report has one
}

export interface OdometerReportParse {
  rows: OdometerReportRow[];
  reportDate: string | null; // the period's end date, m/d/yy
  lineCount: number;
}

const ROW_RE =
  /^(\d{4,7})\s+(\d{3,5})\s+(?:([A-Z]{2,6})\s+)?(\d+\.\d)\s*(\*)?\s+(\d+\.\d)\s*\*?\s+(\d+\.\d)(?:\s+\d+\.\d){4}\s*$/;

export function parseOdometerLine(line: string, page = 1): OdometerReportRow | null {
  const m = ROW_RE.exec(line.trim());
  if (!m) return null;
  const [, number, division, dept, odometer, star, mpg, milesRun] = m;
  const bus = number.replace(/^0+/, "");
  if (!bus) return null;
  return {
    bus,
    division,
    dept: dept || null,
    odometer: Number(odometer), // tenths are kept
    mpg: Number(mpg),
    milesRun: Number(milesRun),
    notServiced: Boolean(star),
    page,
  };
}

// "… between 09/29/2026 04:55 AM and 09/30/2026 08:00 PM" → "9/30/26";
// the footer's "Sep/30/2026 08:28:49 PM" is the fallback.
export function odometerReportDate(line: string): string | null {
  const period = /between\s+\d{1,2}\/\d{1,2}\/\d{4}.*?\band\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(line);
  if (period) return `${Number(period[1])}/${Number(period[2])}/${period[3].slice(-2)}`;
  const footer = /\b([A-Z][a-z]{2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}/.exec(line);
  if (footer) {
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(footer[1]) + 1;
    if (month) return `${month}/${Number(footer[2])}/${footer[3].slice(-2)}`;
  }
  return null;
}

export function parseOdometerReport(pages: PositionedText[][]): OdometerReportParse {
  const rows: OdometerReportRow[] = [];
  let reportDate: string | null = null;
  let lineCount = 0;
  pages.forEach((items, index) => {
    const lines = linesFromText(items);
    lineCount += lines.length;
    for (const line of lines) {
      if (!reportDate) reportDate = odometerReportDate(line);
      const row = parseOdometerLine(line, index + 1);
      if (row) rows.push(row);
    }
  });
  // One line per vehicle on this report; if a number repeats, keep the highest.
  const best = new Map<string, OdometerReportRow>();
  for (const row of rows) {
    const prior = best.get(row.bus);
    if (!prior || row.odometer > prior.odometer) best.set(row.bus, row);
  }
  return {
    rows: [...best.values()].sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true })),
    reportDate,
    lineCount,
  };
}
