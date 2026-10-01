import type { PmKind, PmRecord } from "./pmMileage";
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
  foremanSr: string | null;
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

export function completionTimestamp(entry: PmInspectionEntry): string | null {
  // Older site completions have the time the completion was saved, before
  // the dedicated completedAt field was introduced.
  return entry.completedAt ?? entry.createdAt;
}

export function completionDateText(timestamp: string | null): string {
  if (!timestamp) return "Date and time not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(timestamp));
}

function sortTime(timestamp: string | null): number {
  return timestamp ? Date.parse(timestamp) || 0 : 0;
}

export interface CompletedBusRow {
  bus: string;
  kind: PmKind | null;
  type: string | null;
  miles: number | null;
  completedAt: string | null;
  entry: PmInspectionEntry | null;
}

export function completedBusRows(buses: MasterBus[], entries: PmInspectionEntry[]): CompletedBusRow[] {
  // Only the site's completion log proves work was completed here. Imported
  // or manually edited last-PM schedules must never create completion history.
  const latest = new Map<string, PmInspectionEntry>();
  for (const entry of entries) {
    if (entry.undoneAt) continue;
    const previous = latest.get(entry.bus);
    const difference = sortTime(completionTimestamp(entry)) - sortTime(previous ? completionTimestamp(previous) : null);
    if (!previous || difference > 0 || (difference === 0 && Number(entry.id) > Number(previous.id))) latest.set(entry.bus, entry);
  }
  return buses.map((bus): CompletedBusRow => {
    const entry = latest.get(bus.num) ?? null;
    return { bus: bus.num, kind: entry?.kind ?? null, type: entry?.type ?? null,
      miles: entry?.miles ?? null, completedAt: entry ? completionTimestamp(entry) : null, entry };
  }).sort((a, b) => sortTime(b.completedAt) - sortTime(a.completedAt) || a.bus.localeCompare(b.bus, undefined, { numeric: true }));
}
