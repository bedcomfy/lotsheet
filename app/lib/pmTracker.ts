// The garage's master spreadsheet, "PNW DAILY P.M. TRACKER", built from the
// PM Mileage data so nobody has to copy odometers by hand. Sheet 1 lists every
// bus with its current odometer, the inspection due mark and type, and a
// live "miles until" formula, sorted soonest first. Sheet 2 lists the
// transmission / hub / differential schedule the same way. The layout
// mirrors the workbook the shop already keeps, so it can replace it as is.

import ExcelJS from "exceljs";
import { FLUID_KINDS, FLUID_PM_INTERVAL, FLUID_PM_SCHEDULE, INSPECTION_STEP, fluidNextDue, isPmFleetBus, nextInspection, type FluidKind, type InspectionType, type PmReading, type PmRecord } from "./pmMileage";
import { markToType, previousType } from "./pmReport";
import type { MasterBus } from "./types";

export const TRACKER_SHEET = "PNW DAILY P,M. TRACKER";
export const THD_SHEET = "T,H,D P.M.";
export const THD_SCHEDULES = FLUID_KINDS.map((kind) => FLUID_PM_SCHEDULE[kind]);

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

export interface TrackerFluidRow {
  bus: string;
  kind: FluidKind;
  odometer: number | null;
  due: number;
  milesLeft: number | null;
}

function soonestFirst<T extends { bus: string; milesLeft: number | null }>(a: T, b: T): number {
  if (a.milesLeft === null || b.milesLeft === null) return (a.milesLeft === null ? 1 : 0) - (b.milesLeft === null ? 1 : 0) || a.bus.localeCompare(b.bus, undefined, { numeric: true });
  return a.milesLeft - b.milesLeft || a.bus.localeCompare(b.bus, undefined, { numeric: true });
}

// One inspection row per active PM-fleet bus (blanks when nothing is on
// file, so a missing bus is visible), and one row per fluid PM with a due
// mark (trans, front hub, differential). Both soonest first, like the shop
// sorts the sheet.
export function trackerRows(
  records: Record<string, PmRecord>,
  fleet: Pick<MasterBus, "num" | "status">[],
): { inspections: TrackerInspectionRow[]; fluids: TrackerFluidRow[] } {
  const inspections: TrackerInspectionRow[] = [];
  const fluids: TrackerFluidRow[] = [];
  for (const bus of fleet.filter(isPmFleetBus)) {
    const record = records[bus.num];
    const odometer = record?.odometer ?? null;
    const next = record ? nextInspection(record) : null;
    inspections.push({
      bus: bus.num, odometer, due: next?.miles ?? null, type: next?.type ?? null,
      milesLeft: next && odometer !== null ? next.miles - odometer : null,
    });
    for (const kind of FLUID_KINDS) {
      const due = record ? fluidNextDue(record, kind) : null;
      if (due !== null) fluids.push({ bus: bus.num, kind, odometer, due, milesLeft: odometer === null ? null : due - odometer });
    }
  }
  return { inspections: inspections.sort(soonestFirst), fluids: fluids.sort(soonestFirst) };
}

function busCell(bus: string): number | string {
  return /^\d+$/.test(bus) ? Number(bus) : bus;
}

export async function buildTrackerWorkbook(rows: { inspections: TrackerInspectionRow[]; fluids: TrackerFluidRow[] }): Promise<Buffer> {
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
  rows.fluids.forEach((row, index) => {
    const n = index + 2;
    const added = thd.addRow([busCell(row.bus), FLUID_PM_SCHEDULE[row.kind], row.due, row.odometer, row.milesLeft === null ? null : { formula: `C${n}-D${n}`, result: row.milesLeft }]);
    added.font = BODY_FONT;
    for (const column of ["C", "D", "E"]) added.getCell(column).numFmt = TENTHS;
  });

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

// ---------- reading the shop's workbook: the PM schedule ----------
// The tracker is where the shop records which inspection is due next and the
// trans PM mark, so it can bring the site's schedule up to date. Only the
// live sheets are read: the ones whose miles column is a formula. Pasted
// fleet-system reports in the same workbook are static text and are skipped.

export interface TrackerScheduleRow {
  bus: string;
  nextInspType: InspectionType | null;
  nextInspDue: number | null;
  transDue: number | null;
  hubDue: number | null;
  diffDue: number | null;
  note: string | null;
}

// A T,H,D sheet schedule → which fluid PM it is.
export function fluidKindFromSchedule(text: string): FluidKind | null {
  if (/trans/i.test(text)) return "trans";
  if (/hub/i.test(text)) return "hub";
  if (/differential|\bdiff\b/i.test(text)) return "diff";
  return null;
}

export interface TrackerParse {
  rows: TrackerScheduleRow[];
  sheets: string[]; // the sheets that were read
  lineCount: number;
}

// "PM-A 15000 MILES" → "A-15" by the mark, so "PM-6 6000 MILES" and
// "PM-c 24000 MILES" (typos in the real sheet) still resolve.
export function trackerLabelToType(label: string): InspectionType | null {
  const match = /PM\s*-?\s*[A-Z0-9]?\s*(\d{4,5})\s*MILES/i.exec(label);
  return match ? markToType(Number(match[1])) : null;
}

interface TrackerHeader { row: number; bus: number; due: number; type: number | null; schedule: number | null; miles: number | null }

function cellText(sheet: ExcelJS.Worksheet, row: number, column: number): string {
  return sheet.getCell(row, column).text.trim();
}

function markNumber(sheet: ExcelJS.Worksheet, row: number, column: number): number | null {
  const n = Number(cellText(sheet, row, column).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null; // due marks are whole miles
}

function findTrackerHeader(sheet: ExcelJS.Worksheet): TrackerHeader | null {
  for (let row = 1; row <= Math.min(sheet.rowCount, 8); row += 1) {
    const found: Partial<TrackerHeader> = { row };
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      const text = cellText(sheet, row, column).toLowerCase();
      if (/^(bus\s*#|vehicle\s*(number|#))/.test(text)) found.bus = column;
      else if (/^inspection\s*due/.test(text)) found.due = column;
      else if (/^next\s*insp/.test(text)) found.type = column;
      else if (/^pm\s*schedule/.test(text)) found.schedule = column;
      else if (/^miles\s*(until|till)/.test(text)) found.miles = column;
    }
    if (found.bus && found.due && (found.type || found.schedule)) {
      return { row, bus: found.bus, due: found.due, type: found.type ?? null, schedule: found.schedule ?? null, miles: found.miles ?? null };
    }
  }
  return null;
}

// A live sheet computes its miles column; a pasted report is plain text.
function isLiveSheet(sheet: ExcelJS.Worksheet, header: TrackerHeader): boolean {
  if (!header.miles) return false;
  for (let row = header.row + 1; row <= Math.min(sheet.rowCount, header.row + 5); row += 1) {
    const value = sheet.getCell(row, header.miles).value;
    if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) return true;
  }
  return false;
}

// Tracker rows → schedule-only readings for reviewReadings/applyPmReadings:
// the odometer stays as it is on the site; each due mark also implies the
// last service one interval back, so the site can show when it was done.
export function trackerScheduleReadings(rows: TrackerScheduleRow[]): Array<Omit<PmReading, "readAt"> & { note: string | null }> {
  return rows.map((row) => ({
    bus: row.bus,
    odometer: null,
    scheduleOnly: true,
    note: row.note,
    nextInspType: row.nextInspType,
    nextInspDue: row.nextInspDue,
    lastInspType: row.nextInspType ? previousType(row.nextInspType) : null,
    lastInspMiles: row.nextInspDue === null ? null : row.nextInspDue - INSPECTION_STEP,
    transDue: row.transDue,
    lastTransMiles: row.transDue === null ? null : row.transDue - FLUID_PM_INTERVAL,
    hubDue: row.hubDue,
    lastHubMiles: row.hubDue === null ? null : row.hubDue - FLUID_PM_INTERVAL,
    diffDue: row.diffDue,
    lastDiffMiles: row.diffDue === null ? null : row.diffDue - FLUID_PM_INTERVAL,
  }));
}

export async function parseTrackerWorkbook(file: Buffer | ArrayBuffer): Promise<TrackerParse> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const rows = new Map<string, TrackerScheduleRow>();
  const sheets: string[] = [];
  let lineCount = 0;
  const rowFor = (bus: string) => {
    const existing = rows.get(bus);
    if (existing) return existing;
    const created: TrackerScheduleRow = { bus, nextInspType: null, nextInspDue: null, transDue: null, hubDue: null, diffDue: null, note: null };
    rows.set(bus, created);
    return created;
  };
  for (const sheet of workbook.worksheets) {
    const header = findTrackerHeader(sheet);
    if (!header || !isLiveSheet(sheet, header)) continue;
    sheets.push(sheet.name);
    for (let row = header.row + 1; row <= sheet.rowCount; row += 1) {
      const bus = cellText(sheet, row, header.bus).replace(/^0+(?=\d)/, "");
      if (!/^\d+$/.test(bus)) continue;
      lineCount += 1;
      if (header.type) {
        const entry = rowFor(bus);
        if (entry.nextInspDue !== null) continue; // the first row for a bus wins
        const due = markNumber(sheet, row, header.due);
        const label = cellText(sheet, row, header.type);
        const type = trackerLabelToType(label);
        if (due !== null && type) { entry.nextInspType = type; entry.nextInspDue = due; }
        else if (due !== null) entry.note = label ? `Inspection type not recognized: ${label}` : "Inspection due without a type";
      } else if (header.schedule) {
        const kind = fluidKindFromSchedule(cellText(sheet, row, header.schedule));
        if (!kind) continue;
        const entry = rowFor(bus);
        const key = `${kind}Due` as const;
        if (entry[key] === null) entry[key] = markNumber(sheet, row, header.due);
      }
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true })),
    sheets,
    lineCount,
  };
}
