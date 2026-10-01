import { emptyPmRecord, type PmKind, type PmRecord } from "./pmMileage";
import type { MasterBus } from "./types";

export interface PmInspectionEntry {
  id: string;
  bus: string;
  kind: PmKind;
  type: string | null;
  miles: number;
  odometer: number | null;
  doneAt: string | null;
  completedAt: string | null;
  actor?: string;
  createdAt: string | null;
  undoneAt: string | null;
  canUndo: boolean;
  undoReason: string | null;
}

// Only this PM's schedule participates in conflict detection. Mileage syncing,
// notes, statuses, and the other kind of PM must not invalidate a completion.
export function pmScheduleToken(record: PmRecord, kind: PmKind): string {
  return JSON.stringify(kind === "inspection"
    ? [record.lastInspType, record.lastInspMiles, record.lastInspDate, record.nextInspType, record.nextInspMiles]
    : [record.lastTransMiles, record.lastTransDate, record.nextTransMiles]);
}

export function completionDateText(timestamp: string | null, date: string | null): string {
  if (!timestamp) return date || "Date not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

function sortTime(timestamp: string | null, date: string | null): number {
  if (timestamp) return Date.parse(timestamp) || 0;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(date || "");
  if (!match) return 0;
  return Date.UTC(Number(match[3]) + (match[3].length === 2 ? 2000 : 0), Number(match[1]) - 1, Number(match[2]));
}

export interface CompletedBusRow {
  bus: string;
  kind: PmKind | null;
  type: string | null;
  miles: number | null;
  odometer: number | null;
  completedAt: string | null;
  date: string | null;
  entry: PmInspectionEntry | null;
}

export function completedBusRows(buses: MasterBus[], records: Record<string, PmRecord>, entries: PmInspectionEntry[]): CompletedBusRow[] {
  return buses.map((bus): CompletedBusRow => {
    const record = records[bus.num] || emptyPmRecord(bus.num);
    const candidates = (["inspection", "trans"] as const).flatMap((kind): CompletedBusRow[] => {
      const entry = entries.find((item) => item.bus === bus.num && item.kind === kind && !item.undoneAt);
      const miles = kind === "inspection" ? record.lastInspMiles : record.lastTransMiles;
      const type = kind === "inspection" ? record.lastInspType : null;
      const date = kind === "inspection" ? record.lastInspDate : record.lastTransDate;
      if (miles === null || (kind === "inspection" && !type)) return [];
      // A later import/admin correction may supersede the logged completion.
      const matching = entry && entry.miles === miles && entry.type === type && entry.doneAt === date ? entry : null;
      return [{ bus: bus.num, kind, type, miles, date, odometer: matching?.odometer ?? null,
        completedAt: matching?.completedAt ?? null, entry: matching }];
    });
    candidates.sort((a, b) => sortTime(b.completedAt, b.date) - sortTime(a.completedAt, a.date));
    return candidates[0] || { bus: bus.num, kind: null, type: null, miles: null, odometer: null, completedAt: null, date: null, entry: null };
  }).sort((a, b) => sortTime(b.completedAt, b.date) - sortTime(a.completedAt, a.date) || a.bus.localeCompare(b.bus, undefined, { numeric: true }));
}
