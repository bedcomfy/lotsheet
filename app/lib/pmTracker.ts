// The garage's master spreadsheet, "PNW DAILY P.M. TRACKER", built from the
// PM Mileage data so nobody has to copy odometers by hand. Sheet 1 lists every
// bus with its current odometer, the inspection due mark and type, and a
// live "miles until" formula, sorted soonest first. Sheet 2 lists the
// transmission / hub / differential schedule the same way. The layout
// mirrors the workbook the shop already keeps, so it can replace it as is.

import ExcelJS from "exceljs";
import { isPmFleetBus, nextInspection, transNextDue, type InspectionType, type PmRecord } from "./pmMileage";
import type { MasterBus } from "./types";

export const TRACKER_SHEET = "PNW DAILY P,M. TRACKER";
export const THD_SHEET = "T,H,D P.M.";
export const THD_SCHEDULES = ["TRANS P.M. 75000", "CHANGE FRONT HUB FLUID", "CHANGE DIFFERENTIAL FLUID"] as const;

const TENTHS = "0.0"; // every mileage shows its tenth, 100020.0 included
const HEADER_FONT = { name: "Arial Nova", size: 11, bold: true };
const BODY_FONT = { name: "Aptos Narrow", size: 11 };

// "A-15" → "PM-A 15000 MILES": the label the fleet system prints and the
// tracker's Next Insp Type column uses.
export function trackerInspectionLabel(type: InspectionType): string {
  const [letter, thousands] = type.split("-");
  return `PM-${letter} ${Number(thousands) * 1000} MILES`;
}

export interface TrackerInspectionRow {
  bus: string;
  odometer: number | null;
  due: number | null;
  type: InspectionType | null;
  milesLeft: number | null;
}

export interface TrackerTransRow {
  bus: string;
  odometer: number | null;
  due: number | null;
  milesLeft: number | null;
}

function soonestFirst<T extends { bus: string; milesLeft: number | null }>(a: T, b: T): number {
  if (a.milesLeft === null || b.milesLeft === null) return (a.milesLeft === null ? 1 : 0) - (b.milesLeft === null ? 1 : 0) || a.bus.localeCompare(b.bus, undefined, { numeric: true });
  return a.milesLeft - b.milesLeft || a.bus.localeCompare(b.bus, undefined, { numeric: true });
}

// One inspection row per active PM-fleet bus (blanks when nothing is on
// file, so a missing bus is visible), and one trans row per bus with a
// transmission PM mark. Both soonest first, like the shop sorts the sheet.
export function trackerRows(
  records: Record<string, PmRecord>,
  fleet: Pick<MasterBus, "num" | "status">[],
): { inspections: TrackerInspectionRow[]; trans: TrackerTransRow[] } {
  const inspections: TrackerInspectionRow[] = [];
  const trans: TrackerTransRow[] = [];
  for (const bus of fleet.filter(isPmFleetBus)) {
    const record = records[bus.num];
    const odometer = record?.odometer ?? null;
    const next = record ? nextInspection(record) : null;
    inspections.push({
      bus: bus.num, odometer, due: next?.miles ?? null, type: next?.type ?? null,
      milesLeft: next && odometer !== null ? next.miles - odometer : null,
    });
    const transDue = record ? transNextDue(record) : null;
    if (transDue !== null) trans.push({ bus: bus.num, odometer, due: transDue, milesLeft: odometer === null ? null : transDue - odometer });
  }
  return { inspections: inspections.sort(soonestFirst), trans: trans.sort(soonestFirst) };
}

function busCell(bus: string): number | string {
  return /^\d+$/.test(bus) ? Number(bus) : bus;
}

export async function buildTrackerWorkbook(rows: { inspections: TrackerInspectionRow[]; trans: TrackerTransRow[] }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PM Mileage";
  workbook.created = new Date();

  const tracker = workbook.addWorksheet(TRACKER_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  tracker.columns = [
    { header: "Bus #", width: 12.57 },
    { header: "Current Odometer (UPDATE DAILY)", width: 25.71 },
    { header: "Inspection Due", width: 16 },
    { header: "Miles until next Insp", width: 25.71 },
    { header: "Next Insp Type", width: 27.86 },
    { header: "Workorder", width: 27.43 },
  ];
  rows.inspections.forEach((row, index) => {
    const n = index + 2;
    // A blank cell counts as 0 in Excel, so a bus with nothing on file gets
    // no formula rather than a misleading "0.0" or a negative odometer.
    const added = tracker.addRow([
      busCell(row.bus), row.odometer, row.due,
      row.milesLeft === null ? null : { formula: `C${n}-B${n}`, result: row.milesLeft },
      row.type ? trackerInspectionLabel(row.type) : "", "",
    ]);
    added.font = BODY_FONT;
    for (const column of ["B", "C", "D"]) added.getCell(column).numFmt = TENTHS;
  });

  const thd = workbook.addWorksheet(THD_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  thd.columns = [
    { header: "Vehicle Number", width: 16 },
    { header: "PM Schedule", width: 30 },
    { header: "Inspection Due", width: 16 },
    { header: "Current Mileage", width: 18 },
    { header: "Miles Till Next Inspection", width: 26 },
  ];
  let n = 2;
  for (const row of rows.trans) {
    for (const schedule of THD_SCHEDULES) {
      const added = thd.addRow([busCell(row.bus), schedule, row.due, row.odometer, row.milesLeft === null ? null : { formula: `C${n}-D${n}`, result: row.milesLeft }]);
      added.font = BODY_FONT;
      for (const column of ["C", "D", "E"]) added.getCell(column).numFmt = TENTHS;
      n += 1;
    }
  }

  for (const sheet of [tracker, thd]) sheet.getRow(1).font = HEADER_FONT;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------- copy and paste into the hand-kept workbook ----------
// The shop keeps its own tracker and only the Current Odometer column needs
// new numbers, so nothing is uploaded or rewritten: the user pastes the
// Bus # column in and copies the odometer column out.

// Plain numbers for Excel: one decimal, no thousands separator.
export function trackerNumber(n: number): string {
  return n.toFixed(1);
}

export interface OdometerPaste {
  lines: string[]; // one per pasted line, blank where there is no reading
  buses: number; // bus numbers recognised in the paste
  matched: number; // of those, with a reading on file
  unmatched: string[]; // bus numbers with no reading (left blank)
  skipped: string[]; // lines that were not bus numbers, e.g. a pasted header
}

// The pasted Bus # column, in the sheet's own order → the odometer column in
// the same order. Every pasted line yields exactly one line, so the result
// pastes straight over Current Odometer without shifting any row.
export function odometerLinesFor(input: string, records: Record<string, PmRecord>): OdometerPaste {
  const rows = input.replace(/\r/g, "").split("\n");
  if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop(); // Excel ends a copy with a newline
  const lines: string[] = [];
  const unmatched: string[] = [];
  const skipped: string[] = [];
  let buses = 0;
  let matched = 0;
  for (const raw of rows) {
    const first = raw.split(/[\t,;]/)[0].trim();
    if (!first) { lines.push(""); continue; }
    const bus = first.replace(/^0+(?=\d)/, "");
    if (!/^\d+$/.test(bus)) { skipped.push(first); lines.push(""); continue; }
    buses += 1;
    const odometer = records[bus]?.odometer ?? null;
    if (odometer === null) { unmatched.push(bus); lines.push(""); continue; }
    matched += 1;
    lines.push(trackerNumber(odometer));
  }
  return { lines, buses, matched, unmatched: [...new Set(unmatched)], skipped };
}

// Every active bus with a reading as "bus<TAB>odometer" lines, bus order,
// for a lookup tab when a sheet's rows are in some other order.
export function odometerTable(records: Record<string, PmRecord>, fleet: Pick<MasterBus, "num" | "status">[]): string {
  return fleet
    .filter(isPmFleetBus)
    .map((bus) => [bus.num, records[bus.num]?.odometer ?? null] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== null)
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([bus, odometer]) => `${bus}\t${trackerNumber(odometer)}`)
    .join("\n");
}
