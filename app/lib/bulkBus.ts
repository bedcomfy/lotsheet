// Bulk actions on a list of buses — used by the fleet group dialogs (Home /
// Tonight). Moves go through the shared op log in one atomic batch; flag
// changes go through the audited per-bus endpoint, one bus at a time, and
// report how many failed so the UI never silently loses a change.

import { postBusFlags } from "./busDetails";
import { getDeviceActor } from "./deviceActor";
import type { LotSheetOp } from "./lotSheetOps";
import { emptyFlagEntry } from "./serviceLaneSetup";
import type { FlagEntry, FlagMap, LotKey } from "./types";

export const BULK_MOVE_TARGETS: Array<{ key: LotKey; label: string }> = [
  { key: "north", label: "North Lot" },
  { key: "east", label: "East Lot" },
  { key: "fence", label: "Fence" },
  { key: "apron", label: "Apron" },
  { key: "cards", label: "Cards" },
];

export interface BulkResult {
  done: number;
  failed: string[];
}

// One ops batch: every bus leaves wherever it sits and lands in the lot.
export async function moveBusesToLot(buses: string[], key: LotKey): Promise<BulkResult> {
  const ops: LotSheetOp[] = buses.map((bus) => ({
    type: "move_bus",
    bus,
    destination: { kind: "lot", key },
  }));
  try {
    const response = await fetch("/api/sheet/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops, actor: getDeviceActor() }),
    });
    if (!response.ok) return { done: 0, failed: [...buses] };
    return { done: buses.length, failed: [] };
  } catch {
    return { done: 0, failed: [...buses] };
  }
}

async function forEachBus(
  buses: string[],
  next: (bus: string) => FlagEntry | null,
  onSaved: (bus: string, entry: FlagEntry) => void,
  onProgress?: (done: number) => void,
): Promise<BulkResult> {
  const failed: string[] = [];
  let done = 0;
  for (const bus of buses) {
    const entry = next(bus);
    if (entry) {
      const ok = await postBusFlags(bus, entry);
      if (ok) onSaved(bus, entry);
      else failed.push(bus);
    }
    done += 1;
    onProgress?.(done);
  }
  return { done, failed };
}

export function addFlagToBuses(
  buses: string[],
  flagId: string,
  flags: FlagMap,
  onSaved: (bus: string, entry: FlagEntry) => void,
  onProgress?: (done: number) => void,
): Promise<BulkResult> {
  return forEachBus(
    buses,
    (bus) => {
      const current = flags[bus] || emptyFlagEntry();
      if (current.flags.includes(flagId)) return null;
      return { ...current, flags: [...current.flags, flagId] };
    },
    onSaved,
    onProgress,
  );
}

export function clearFlagsOnBuses(
  buses: string[],
  flags: FlagMap,
  onSaved: (bus: string, entry: FlagEntry) => void,
  onProgress?: (done: number) => void,
): Promise<BulkResult> {
  return forEachBus(
    buses,
    (bus) => (flags[bus] && (flags[bus].flags.length || (flags[bus].note || "").trim()) ? emptyFlagEntry() : null),
    onSaved,
    onProgress,
  );
}
