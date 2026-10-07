// Fleetwatch "Vehicle List Report" (Detail): one line per vehicle with the
// current odometer. Unlike the monthly-miles and service reports it has no
// date window, so it is always current, which makes it the source for the
// PM Mileage "Force Update" button and an accepted Import PDF upload.
//
// The columns are located from the report's own header row (a "Vehicle" /
// "Unit" column and an "Odometer" / "Meter" / "Mileage" column), and every
// value is taken from the token nearest its header. A report whose header
// cannot be found yields no rows, so nothing is ever guessed. Pure: fed from
// positioned text, like the other report readers.

import type { PositionedText } from "./pmReport";
import { odometerReportDate } from "./odometerReport";

export interface VehicleListRow {
  bus: string; // leading zeros stripped: "006450" → "6450"
  odometer: number; // whole miles
  page: number;
  line: string;
}

export interface VehicleListParse {
  rows: VehicleListRow[];
  reportDate: string | null; // the report's print date, m/d/yy
  lineCount: number;
  columns: { vehicle: string; odometer: string } | null; // the header text that was matched
}

const ROW_TOLERANCE = 4.5;
const VEHICLE_HEADER = /^(vehicle|veh\.?|unit|bus|equipment)(\s*(#|no\.?|number|num\.?|id))?$/i;
const ODOMETER_HEADER = /^((current|last|latest)\s+)?(odometer|odom\.?|meter|mileage|miles)(\s*(reading|read|rdg\.?))?$/i;
const BUS_TOKEN = /^\d{3,7}$/;
const MILES_TOKEN = /^(\d{1,3}(,\d{3})+|\d{1,9})(\.\d+)?$/;
const TOTAL_LINE = /\b(total|subtotal|count|average|page\s+\d+)\b/i;

interface Token { text: string; row: number; col: number }

// Same grouping as linesFromText, but keeping each token's position.
export function positionedLines(items: PositionedText[]): Token[][] {
  const keyed: Token[] = items
    .filter((it) => it.text.trim())
    .map((it) => ({ text: it.text.trim(), row: it.x * it.dirY - it.y * it.dirX, col: it.x * it.dirX + it.y * it.dirY }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const lines: Token[][] = [];
  let bucket: Token[] = [];
  let anchor: number | null = null;
  for (const token of keyed) {
    if (anchor === null || Math.abs(token.row - anchor) <= ROW_TOLERANCE) {
      bucket.push(token);
      if (anchor === null) anchor = token.row;
    } else {
      lines.push(bucket.sort((a, b) => a.col - b.col));
      bucket = [token];
      anchor = token.row;
    }
  }
  if (bucket.length) lines.push(bucket.sort((a, b) => a.col - b.col));
  return lines;
}

interface Header { cols: number[]; vehicle: number; odometer: number; text: { vehicle: string; odometer: string } }

// A header row names both columns. Adjacent header words ("Vehicle" "Number")
// may arrive as separate tokens, so pairs are tried as well as single tokens.
function findHeader(line: Token[]): Header | null {
  const candidates: Array<{ text: string; col: number; index: number; span: number }> = [];
  line.forEach((token, index) => {
    candidates.push({ text: token.text, col: token.col, index, span: 1 });
    const next = line[index + 1];
    if (next) candidates.push({ text: `${token.text} ${next.text}`, col: (token.col + next.col) / 2, index, span: 2 });
  });
  // Prefer the longest match so "Vehicle Number" wins over "Vehicle".
  const longest = (re: RegExp) => candidates.filter((c) => re.test(c.text)).sort((a, b) => b.text.length - a.text.length)[0];
  const vehicle = longest(VEHICLE_HEADER);
  const odometer = longest(ODOMETER_HEADER);
  if (!vehicle || !odometer || vehicle.index === odometer.index) return null;
  // Column positions: the two matched headers (a two-word header counts once,
  // at its centre) plus every other header word.
  const merged = new Set<number>();
  for (const chosen of [vehicle, odometer]) for (let i = 0; i < chosen.span; i++) merged.add(chosen.index + i);
  const cols = [vehicle.col, odometer.col, ...line.filter((_, index) => !merged.has(index)).map((token) => token.col)];
  return { cols, vehicle: vehicle.col, odometer: odometer.col, text: { vehicle: vehicle.text, odometer: odometer.text } };
}

// The token that sits under a header: nearest to that header's position, and
// nearer to it than to any other header, so right-aligned numbers still land
// in their own column.
function valueUnder(line: Token[], header: Header, target: number, accept: RegExp): Token | null {
  let best: Token | null = null;
  for (const token of line) {
    if (!accept.test(token.text)) continue;
    const distance = Math.abs(token.col - target);
    const nearestOther = Math.min(...header.cols.filter((c) => c !== target).map((c) => Math.abs(token.col - c)), Infinity);
    if (distance > 160 || distance > nearestOther) continue;
    if (!best || distance < Math.abs(best.col - target)) best = token;
  }
  return best;
}

export function parseVehicleListReport(pages: PositionedText[][]): VehicleListParse {
  const rows: VehicleListRow[] = [];
  let reportDate: string | null = null;
  let lineCount = 0;
  let header: Header | null = null;
  let columns: VehicleListParse["columns"] = null;
  pages.forEach((items, index) => {
    for (const line of positionedLines(items)) {
      lineCount += 1;
      const text = line.map((t) => t.text).join(" ");
      if (!reportDate) reportDate = odometerReportDate(text);
      const found = findHeader(line);
      if (found) { header = found; columns = columns || found.text; continue; }
      if (!header || TOTAL_LINE.test(text)) continue;
      const busToken = valueUnder(line, header, header.vehicle, BUS_TOKEN);
      const milesToken = valueUnder(line, header, header.odometer, MILES_TOKEN);
      if (!busToken || !milesToken) continue;
      const bus = busToken.text.replace(/^0+/, "");
      const odometer = Math.round(Number(milesToken.text.replace(/,/g, "")));
      if (!bus || !Number.isFinite(odometer) || odometer <= 0) continue;
      rows.push({ bus, odometer, page: index + 1, line: text });
    }
  });
  // One line per vehicle; if a number repeats, keep the highest reading.
  const best = new Map<string, VehicleListRow>();
  for (const row of rows) {
    const prior = best.get(row.bus);
    if (!prior || row.odometer > prior.odometer) best.set(row.bus, row);
  }
  return { rows: [...best.values()], reportDate, lineCount, columns };
}
