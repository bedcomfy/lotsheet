// Preventive-maintenance mileage: one record per bus with its latest odometer
// reading and where the next PM inspection falls. Pure helpers only (no I/O) so
// the page, the API, and the PDF import all derive "miles left" the same way.

import type { MasterBus } from "./types";

export const DEFAULT_PM_INTERVAL = 6000; // miles between PM inspections
export const DEFAULT_DUE_SOON_MILES = 500; // "due soon" once this close

export interface PmRecord {
  bus: string;
  odometer: number | null; // latest reading, miles
  odometerDate: string | null; // when that reading was taken (free text / ISO date)
  lastPmMiles: number | null; // odometer at the last PM inspection
  lastPmDate: string | null;
  interval: number | null; // per-bus override; null = the default interval
  note: string;
  source: string; // "manual" | "pdf" | ""
  updatedAt: string | null;
}

export interface PmSettings {
  defaultInterval: number;
  dueSoonMiles: number;
}

export const DEFAULT_PM_SETTINGS: PmSettings = {
  defaultInterval: DEFAULT_PM_INTERVAL,
  dueSoonMiles: DEFAULT_DUE_SOON_MILES,
};

export type PmStatus = "unknown" | "ok" | "due-soon" | "overdue";

export function emptyPmRecord(bus: string): PmRecord {
  return {
    bus,
    odometer: null,
    odometerDate: null,
    lastPmMiles: null,
    lastPmDate: null,
    interval: null,
    note: "",
    source: "",
    updatedAt: null,
  };
}

export function normalizePmSettings(value: unknown): PmSettings {
  const v = (value || {}) as Partial<Record<keyof PmSettings, unknown>>;
  const interval = toMiles(v.defaultInterval);
  const dueSoon = toMiles(v.dueSoonMiles);
  return {
    defaultInterval: interval && interval > 0 ? interval : DEFAULT_PM_INTERVAL,
    dueSoonMiles: dueSoon !== null && dueSoon >= 0 ? dueSoon : DEFAULT_DUE_SOON_MILES,
  };
}

// Whole miles or null. Accepts "123,456" and "123456.7" from typed fields.
export function toMiles(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function pmInterval(record: PmRecord, settings: PmSettings): number {
  return record.interval && record.interval > 0 ? record.interval : settings.defaultInterval;
}

// Odometer at which the next PM is due: last PM + interval. Unknown until a
// last-PM reading exists.
export function nextPmDue(record: PmRecord, settings: PmSettings): number | null {
  if (record.lastPmMiles === null) return null;
  return record.lastPmMiles + pmInterval(record, settings);
}

// Miles to go (negative = overdue). Needs both a next-due mark and a reading.
export function milesRemaining(record: PmRecord, settings: PmSettings): number | null {
  const due = nextPmDue(record, settings);
  if (due === null || record.odometer === null) return null;
  return due - record.odometer;
}

export function pmStatus(record: PmRecord, settings: PmSettings): PmStatus {
  const left = milesRemaining(record, settings);
  if (left === null) return "unknown";
  if (left < 0) return "overdue";
  if (left <= settings.dueSoonMiles) return "due-soon";
  return "ok";
}

export const PM_STATUS_LABEL: Record<PmStatus, string> = {
  unknown: "No reading",
  ok: "OK",
  "due-soon": "Due soon",
  overdue: "Overdue",
};

// Sort: overdue first (most overdue at the top), then due soon, then OK by
// miles left, then buses with no reading, each group by bus number.
export function sortPmRecords(records: PmRecord[], settings: PmSettings): PmRecord[] {
  const rank: Record<PmStatus, number> = { overdue: 0, "due-soon": 1, ok: 2, unknown: 3 };
  return [...records].sort((a, b) => {
    const sa = pmStatus(a, settings);
    const sb = pmStatus(b, settings);
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
    const la = milesRemaining(a, settings);
    const lb = milesRemaining(b, settings);
    if (la !== null && lb !== null && la !== lb) return la - lb;
    return a.bus.localeCompare(b.bus, undefined, { numeric: true });
  });
}

export function formatMiles(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("en-US");
}

// ---------- readings extracted from a PDF (or pasted) ----------
export interface PmReading {
  bus: string;
  odometer: number;
  readAt: string | null;
  note?: string | null;
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
  rows: Array<{ bus: unknown; odometer: unknown; readAt?: unknown; note?: unknown }>,
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
    if (!prior || odometer > prior.odometer) best.set(bus, { bus, odometer, readAt, note });
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
