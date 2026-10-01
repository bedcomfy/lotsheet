// Preventive-maintenance mileage: one record per bus with its latest odometer
// reading, the last inspection it had (type + mileage), and the last
// transmission PM. Explicit next-due values can come from a report or a
// correction without inventing a completed inspection. Older records still
// derive their next work from the last completed PM.

import type { MasterBus } from "./types";

// The inspection cycle, in order. The number is the mile mark within the
// cycle (A-3 = 3,000 miles after the cycle starts), so the interval to the
// next inspection is the gap between marks: B-12 → A-15 is 3,000 miles. After
// C-24 the cycle starts over at A-3.
export const INSPECTION_CYCLE = ["A-3", "B-6", "A-9", "B-12", "A-15", "B-18", "A-21", "C-24"] as const;
export type InspectionType = (typeof INSPECTION_CYCLE)[number];

// Transmission PMs run on their own fixed interval, off the same odometer.
export const TRANS_PM_INTERVAL = 75_000;
const INSPECTION_STEP = 3_000; // every inspection mark is 3,000 miles on
export const DEFAULT_DUE_SOON_MILES = 500; // "due soon" once this close

export type PmKind = "inspection" | "trans";

// Where a bus stands while it waits on its PM: in the shop, needs a follow-up,
// on hold, or split (work spread over visits). Free to change; not derived.
export const PM_DISPOSITIONS = ["", "shop", "follow-up", "hold", "split"] as const;
export type PmDisposition = (typeof PM_DISPOSITIONS)[number];
export const PM_DISPOSITION_LABEL: Record<PmDisposition, string> = {
  "": "—",
  shop: "Shop",
  "follow-up": "Follow up",
  hold: "Hold",
  split: "Split",
};
export function isPmDisposition(value: unknown): value is PmDisposition {
  return typeof value === "string" && (PM_DISPOSITIONS as readonly string[]).includes(value);
}
export function normalizeDisposition(value: unknown): PmDisposition {
  const v = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (v === "followup") return "follow-up";
  return isPmDisposition(v) ? v : "";
}

export function isInspectionType(value: unknown): value is InspectionType {
  return typeof value === "string" && (INSPECTION_CYCLE as readonly string[]).includes(value);
}

// "B-12" → 12,000.
export function inspectionMark(type: InspectionType): number {
  return Number(type.split("-")[1]) * 1000;
}

export function nextInspectionType(last: InspectionType | null): InspectionType | null {
  if (!last) return null;
  const i = INSPECTION_CYCLE.indexOf(last);
  return INSPECTION_CYCLE[(i + 1) % INSPECTION_CYCLE.length];
}

// Miles between an inspection and the one after it. Wrapping from C-24 back
// to A-3 is the A-3 mark itself (3,000).
export function inspectionInterval(from: InspectionType, to: InspectionType): number {
  const a = inspectionMark(from);
  const b = inspectionMark(to);
  return b > a ? b - a : b;
}

export interface PmRecord {
  bus: string;
  odometer: number | null; // current mileage
  odometerDate: string | null; // when that reading was taken (free text / ISO date)
  lastInspType: InspectionType | null; // the inspection most recently completed
  lastInspMiles: number | null; // odometer when it was done
  lastInspDate: string | null;
  lastTransMiles: number | null; // odometer at the last transmission PM
  lastTransDate: string | null;
  nextInspType: InspectionType | null;
  nextInspMiles: number | null;
  nextTransMiles: number | null;
  disposition: PmDisposition; // shop / follow-up / hold / split, or none
  note: string;
  source: string; // "manual" | "pdf" | ""
  updatedAt: string | null;
}

export interface PmSettings {
  dueSoonMiles: number;
}

export const DEFAULT_PM_SETTINGS: PmSettings = { dueSoonMiles: DEFAULT_DUE_SOON_MILES };

export type PmStatus = "unknown" | "ok" | "due-soon" | "overdue";

export function emptyPmRecord(bus: string): PmRecord {
  return {
    bus,
    odometer: null,
    odometerDate: null,
    lastInspType: null,
    lastInspMiles: null,
    lastInspDate: null,
    lastTransMiles: null,
    lastTransDate: null,
    nextInspType: null,
    nextInspMiles: null,
    nextTransMiles: null,
    disposition: "",
    note: "",
    source: "",
    updatedAt: null,
  };
}

export function normalizePmSettings(value: unknown): PmSettings {
  const v = (value || {}) as Partial<Record<keyof PmSettings, unknown>>;
  const dueSoon = toMiles(v.dueSoonMiles);
  return { dueSoonMiles: dueSoon !== null && dueSoon >= 0 ? dueSoon : DEFAULT_DUE_SOON_MILES };
}

// Whole miles or null. Accepts "123,456" and "123456.7" from typed fields.
export function toMiles(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// ---------- inspections ----------
export interface NextInspection {
  type: InspectionType;
  miles: number; // odometer at which it is due
  interval: number;
}

// Use an explicit next inspection when supplied; otherwise derive it from
// the last completed inspection. Neither path invents a completion date.
export function nextInspection(record: PmRecord): NextInspection | null {
  if (record.nextInspType && record.nextInspMiles != null) {
    return { type: record.nextInspType, miles: record.nextInspMiles, interval: INSPECTION_STEP };
  }
  if (!record.lastInspType || record.lastInspMiles === null) return null;
  const type = nextInspectionType(record.lastInspType);
  if (!type) return null;
  const interval = inspectionInterval(record.lastInspType, type);
  return { type, miles: record.lastInspMiles + interval, interval };
}

// Miles to go (negative = past due). Needs both a next-due mark and a reading.
export function inspMilesRemaining(record: PmRecord): number | null {
  const next = nextInspection(record);
  if (!next || record.odometer === null) return null;
  return next.miles - record.odometer;
}

// ---------- transmission PM ----------
// Transmission PM keeps its own due mileage, even when an inspection is
// nearby. Completing or correcting an inspection must not move this mark.
export function transNextDue(record: PmRecord): number | null {
  if (record.nextTransMiles != null) return record.nextTransMiles;
  if (record.lastTransMiles === null) return null;
  return record.lastTransMiles + TRANS_PM_INTERVAL;
}

export function transMilesRemaining(record: PmRecord): number | null {
  const due = transNextDue(record);
  if (due === null || record.odometer === null) return null;
  return due - record.odometer;
}

// ---------- status ----------
export function statusForMiles(left: number | null, settings: PmSettings): PmStatus {
  if (left === null) return "unknown";
  if (left < 0) return "overdue";
  if (left <= settings.dueSoonMiles) return "due-soon";
  return "ok";
}

export function inspStatus(record: PmRecord, settings: PmSettings): PmStatus {
  return statusForMiles(inspMilesRemaining(record), settings);
}

export function transStatus(record: PmRecord, settings: PmSettings): PmStatus {
  return statusForMiles(transMilesRemaining(record), settings);
}

const STATUS_RANK: Record<PmStatus, number> = { overdue: 0, "due-soon": 1, ok: 2, unknown: 3 };

// The bus's overall status is whichever of its two PMs needs attention first.
export function pmStatus(record: PmRecord, settings: PmSettings): PmStatus {
  const a = inspStatus(record, settings);
  const b = transStatus(record, settings);
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

export const PM_STATUS_LABEL: Record<PmStatus, string> = {
  unknown: "No record",
  ok: "OK",
  "due-soon": "Due soon",
  overdue: "Overdue",
};

// The smaller of the two miles-left figures (the one that decides the status).
export function soonestMilesRemaining(record: PmRecord): number | null {
  const a = inspMilesRemaining(record);
  const b = transMilesRemaining(record);
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

// Sort: overdue first (most overdue at the top), then due soon, then OK by
// miles left, then buses with no record, each group by bus number.
export function sortPmRecords(records: PmRecord[], settings: PmSettings): PmRecord[] {
  return [...records].sort((a, b) => {
    const sa = pmStatus(a, settings);
    const sb = pmStatus(b, settings);
    if (STATUS_RANK[sa] !== STATUS_RANK[sb]) return STATUS_RANK[sa] - STATUS_RANK[sb];
    const la = soonestMilesRemaining(a);
    const lb = soonestMilesRemaining(b);
    if (la !== null && lb !== null && la !== lb) return la - lb;
    return a.bus.localeCompare(b.bus, undefined, { numeric: true });
  });
}

export interface PmWorkItem {
  id: string;
  record: PmRecord;
  kind: PmKind;
  type: InspectionType | null;
  dueMiles: number | null;
  milesLeft: number | null;
  status: PmStatus;
}

// One row per kind of work, including unknown schedules so they can be set up.
// Counts and filters describe PMs, not distinct buses.
export function pmWorkItems(records: PmRecord[], settings: PmSettings): PmWorkItem[] {
  return records.flatMap((record): PmWorkItem[] => {
    const inspection = nextInspection(record);
    return (["inspection", "trans"] as const).map((kind) => {
      const dueMiles = kind === "inspection" ? inspection?.miles ?? null : transNextDue(record);
      const milesLeft = dueMiles === null || record.odometer === null ? null : dueMiles - record.odometer;
      return {
        id: `${record.bus}:${kind}`, record, kind,
        type: kind === "inspection" ? inspection?.type ?? null : null,
        dueMiles, milesLeft, status: statusForMiles(milesLeft, settings),
      };
    });
  }).sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    (a.milesLeft !== null && b.milesLeft !== null ? a.milesLeft - b.milesLeft : 0) ||
    a.record.bus.localeCompare(b.record.bus, undefined, { numeric: true }) ||
    a.kind.localeCompare(b.kind),
  );
}

export function formatMiles(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("en-US");
}

// ---------- completing a PM ----------
export interface PmCompletion {
  kind: PmKind;
  type?: InspectionType | null; // inspection only; defaults to the one that was next
  miles: number; // odometer when it was done
  date: string | null;
}

// The record after a PM is done: the completed one becomes "last", so the
// next one (and its due mileage) moves forward. The PM is recorded at the
// mileage it was DUE at, not the odometer when it happened, so the cycle
// stays on its fixed marks (due 428,422 → done → next at 431,422) the same
// way the fleet system schedules it; the entered mileage only moves the
// odometer forward. A first inspection (no due mark yet) or an explicitly
// different type is recorded at the entered mileage.
export function applyCompletion(record: PmRecord, completion: PmCompletion): PmRecord {
  const miles = toMiles(completion.miles);
  if (miles === null) throw new Error("A mileage is required to complete a PM.");
  const odometer = record.odometer === null || miles > record.odometer ? miles : record.odometer;
  const odometerDate = record.odometer === null || miles > record.odometer ? completion.date : record.odometerDate;
  if (completion.kind === "trans") {
    const due = transNextDue(record);
    return { ...record, odometer, odometerDate, lastTransMiles: due ?? miles, lastTransDate: completion.date, nextTransMiles: null };
  }
  const next = nextInspection(record);
  const type = completion.type ?? next?.type ?? null;
  if (!type) throw new Error("Pick which inspection was done — this bus has no inspection on record yet.");
  const recordedAt = next && next.type === type ? next.miles : miles;
  return { ...record, odometer, odometerDate, lastInspType: type, lastInspMiles: recordedAt, lastInspDate: completion.date, nextInspType: null, nextInspMiles: null };
}

// The mileage a completion will be recorded at (for previews).
export function completionRecordedAt(record: PmRecord, kind: PmKind, type: InspectionType | null, miles: number): number {
  if (kind === "trans") return transNextDue(record) ?? miles;
  const next = nextInspection(record);
  return next && (type === null || next.type === type) ? next.miles : miles;
}

// ---------- readings extracted from a PDF (or pasted) ----------
export interface PmReading {
  bus: string;
  odometer: number;
  readAt: string | null;
  note?: string | null;
  // Present when the source says which PM is next (the PM status report):
  // the last inspection and trans PM follow from it, and get written too.
  nextInspType?: InspectionType | null;
  nextInspDue?: number | null;
  lastInspType?: InspectionType | null;
  lastInspMiles?: number | null;
  transDue?: number | null;
  lastTransMiles?: number | null;
}

export interface PmReadingReview extends PmReading {
  previous: number | null; // the odometer on file before this reading
  delta: number | null; // new - previous
  warning: string | null; // e.g. lower than the reading on file
}

export interface PmReadingRejection {
  bus: string;
  odometer: number | null;
  reason: string;
}

// A bus number as it appears on a report: "6404", "Bus 6404", "06404", "6404.0".
export function normalizeReportBus(raw: unknown, known: Set<string>): string {
  const text = String(raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  if (known.has(digits)) return digits;
  const trimmed = digits.replace(/^0+/, "");
  if (trimmed && known.has(trimmed)) return trimmed;
  // A long token that ends with a known number (e.g. a unit id with a prefix).
  for (const num of known) {
    if (num.length >= 3 && digits.endsWith(num) && digits.length - num.length <= 3) return num;
  }
  return trimmed || digits;
}

// Turn whatever the extractor returned into rows the crew can review:
// unknown buses and unusable numbers are rejected, duplicates collapse to the
// highest reading, and a reading below the one on file is kept but flagged.
export function reviewReadings(
  rows: Array<{ bus: unknown; odometer: unknown; readAt?: unknown; note?: unknown } & Partial<Omit<PmReading, "bus" | "odometer" | "readAt" | "note">>>,
  fleet: Pick<MasterBus, "num" | "status">[],
  current: Record<string, PmRecord>,
): { accepted: PmReadingReview[]; rejected: PmReadingRejection[] } {
  const known = new Set(fleet.map((b) => b.num));
  const retired = new Set(fleet.filter((b) => b.status === "retired").map((b) => b.num));
  const best = new Map<string, PmReading>();
  const rejected: PmReadingRejection[] = [];
  for (const row of rows) {
    const bus = normalizeReportBus(row.bus, known);
    const odometer = toMiles(row.odometer);
    if (!bus || !known.has(bus)) {
      rejected.push({ bus: String(row.bus ?? "").trim() || "?", odometer, reason: "Not in the fleet list" });
      continue;
    }
    if (odometer === null || odometer === 0) {
      rejected.push({ bus, odometer, reason: "No usable odometer reading" });
      continue;
    }
    if (retired.has(bus)) {
      rejected.push({ bus, odometer, reason: "Bus is retired" });
      continue;
    }
    const readAt = row.readAt ? String(row.readAt).trim() || null : null;
    const note = row.note ? String(row.note).trim() || null : null;
    const prior = best.get(bus);
    if (!prior || odometer > prior.odometer) {
      best.set(bus, {
        bus,
        odometer,
        readAt,
        note,
        nextInspType: isInspectionType(row.nextInspType) ? row.nextInspType : null,
        nextInspDue: toMiles(row.nextInspDue),
        lastInspType: isInspectionType(row.lastInspType) ? row.lastInspType : null,
        lastInspMiles: toMiles(row.lastInspMiles),
        transDue: toMiles(row.transDue),
        lastTransMiles: toMiles(row.lastTransMiles),
      });
    }
  }
  const accepted: PmReadingReview[] = [...best.values()]
    .sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true }))
    .map((reading) => {
      const previous = current[reading.bus]?.odometer ?? null;
      const delta = previous === null ? null : reading.odometer - previous;
      const warning =
        delta !== null && delta < 0
          ? `Lower than the ${formatMiles(previous)} on file`
          : delta !== null && delta > 50000
            ? `Jumps ${formatMiles(delta)} miles from the reading on file`
            : null;
      return { ...reading, previous, delta, warning };
    });
  return { accepted, rejected };
}
