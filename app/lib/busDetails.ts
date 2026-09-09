// One answer to "what is bus X right now" for every bus surface (search, the
// Bus Card, Home rows): status, location, model — derived from the shared lot
// sheet, flags, and master list so no two screens disagree.

import type { StatusTone } from "../ui/StatusBadge";
import { getDeviceActor } from "./deviceActor";
import { fleetBusLocations, fleetStats } from "./fleetStats";
import type { BusMaster, FlagEntry, FlagMap, LotSheet } from "./types";

export type BusStatus = "ready" | "notReady" | "offProperty" | "missing" | "retired";

export interface BusDetails {
  bus: string;
  label: string;
  model: string;
  location: string;
  locations: string[];
  status: BusStatus;
}

export const BUS_STATUS_COPY: Record<BusStatus, { label: string; tone: StatusTone }> = {
  ready: { label: "Ready for service", tone: "success" },
  notReady: { label: "Not ready for service", tone: "warning" },
  offProperty: { label: "Off property", tone: "info" },
  missing: { label: "Missing", tone: "danger" },
  retired: { label: "Retired", tone: "neutral" },
};

export function busDetails(
  bus: string,
  sheet: LotSheet | null | undefined,
  flags: FlagMap | null | undefined,
  master: BusMaster,
  label: (bus: string) => string,
): BusDetails {
  const locations = fleetBusLocations(sheet, flags)[bus] || [];
  const fleet = fleetStats(sheet, flags, master.buses);
  const record = master.buses.find((item) => item.num === bus);
  let status: BusStatus = "missing";
  if (record?.status === "retired") status = "retired";
  else if (fleet.offProperty.has(bus)) status = "offProperty";
  else if (fleet.readyForService.has(bus)) status = "ready";
  else if (fleet.notReadyForService.has(bus)) status = "notReady";
  return {
    bus,
    label: label(bus),
    model: record?.model || "",
    locations,
    location: locations.length ? locations.join(" · ") : "No current placement",
    status,
  };
}

// Save one bus's full flag entry through the audited live endpoint. Resolves
// true when the server accepted it.
export async function postBusFlags(bus: string, entry: FlagEntry): Promise<boolean> {
  try {
    const response = await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bus,
        flags: entry.flags,
        note: entry.note,
        inspMiles: entry.inspMiles ?? null,
        holdReason: entry.holdReason ?? "",
        cardsReason: entry.cardsReason ?? "",
        retorqueTires: entry.retorqueTires || [],
        inspOption: entry.inspOption ?? "",
        actor: getDeviceActor(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
