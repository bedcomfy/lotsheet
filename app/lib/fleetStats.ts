import type { FlagMap, LotKey, LotSheet, MasterBus } from "./types";
import { cellLocationLabel } from "./grid";

export const LOT_COUNT_KEYS: LotKey[] = ["north", "east", "fence"];
export const SHOP_COUNT_KEYS: LotKey[] = ["apron", "bay", "cards"];
const ALL_LOCATION_KEYS: LotKey[] = [
  "north", "east", "fence", "rc", "apron", "northlane", "southlane", "bay", "cards",
];

function cellBus(value: unknown): string {
  if (!value) return "";
  return typeof value === "string" ? value : String((value as { num?: unknown }).num || "");
}

function busesInLocations(sheet: LotSheet | null | undefined, keys: LotKey[]): Set<string> {
  const buses = new Set<string>();
  for (const key of keys) {
    for (const bus of sheet?.lots?.[key] || []) {
      if (bus && bus !== "X") buses.add(bus);
    }
  }
  return buses;
}

export interface FleetStats {
  activeFleet: Set<string>;
  onGrid: Set<string>;
  inLots: Set<string>;
  inShop: Set<string>;
  offProperty: Set<string>;
  readyForService: Set<string>;
  notReadyForService: Set<string>;
  accounted: Set<string>;
  missing: string[];
  accountedByFlagOnly: string[];
}

// JUDI is a support vehicle, not a revenue fleet bus. Keep the number fallback
// so a CSV import cannot accidentally reintroduce it if the display name is
// temporarily missing.
export function countsTowardFleet(bus: MasterBus): boolean {
  return bus.status !== "retired"
    && bus.num !== "9690"
    && (bus.name || "").trim().toUpperCase() !== "JUDI";
}

const LOT_LOCATION_LABELS: Record<LotKey, string> = {
  north: "North Lot",
  east: "East Lot",
  fence: "Fence",
  rc: "R/C",
  apron: "Apron",
  northlane: "North Lane",
  southlane: "South Lane",
  bay: "Bay",
  cards: "Cards",
};

export function fleetBusLocations(
  sheet: LotSheet | null | undefined,
  flags: FlagMap | null | undefined
): Record<string, string[]> {
  const locations: Record<string, string[]> = {};
  const add = (bus: string, label: string) => {
    if (!bus || bus === "X" || !label) return;
    const current = locations[bus] || (locations[bus] = []);
    if (!current.includes(label)) current.push(label);
  };

  for (const [id, value] of Object.entries(sheet?.cells || {})) {
    add(cellBus(value), cellLocationLabel(id) || "Grid");
  }
  for (const key of ALL_LOCATION_KEYS) {
    (sheet?.lots?.[key] || []).forEach((bus, index) => {
      const numbered = key === "bay" || key === "cards";
      add(bus, numbered ? `${LOT_LOCATION_LABELS[key]} ${index + 1}` : LOT_LOCATION_LABELS[key]);
    });
  }
  for (const [bus, entry] of Object.entries(flags || {})) {
    if ((entry.flags || []).includes("offprop")) add(bus, "Off property");
    if ((entry.flags || []).includes("shop") && !locations[bus]?.some((label) =>
      label.startsWith("Apron") || label.startsWith("Bay") || label.startsWith("Cards")
    )) add(bus, "In shop");
  }
  return locations;
}

// One definition of the fleet totals used everywhere:
// lots = North + East + Fence; shop = Apron + Bays + Cards. Off-property and
// in-shop flags keep an unplaced bus accounted for without inflating a physical
// location count.
export function fleetStats(
  sheet: LotSheet | null | undefined,
  flags: FlagMap | null | undefined,
  masterBuses: MasterBus[] = []
): FleetStats {
  const rawOnGrid = new Set<string>();
  for (const value of Object.values(sheet?.cells || {})) {
    const bus = cellBus(value);
    if (bus && bus !== "X") rawOnGrid.add(bus);
  }

  const rawInLots = busesInLocations(sheet, LOT_COUNT_KEYS);
  const rawInShop = busesInLocations(sheet, SHOP_COUNT_KEYS);
  const rawAllLocated = busesInLocations(sheet, ALL_LOCATION_KEYS);
  const offProperty = new Set<string>();
  const inShopByFlag = new Set<string>();
  for (const [bus, entry] of Object.entries(flags || {})) {
    if ((entry.flags || []).includes("offprop")) offProperty.add(bus);
    if ((entry.flags || []).includes("shop")) inShopByFlag.add(bus);
  }

  // R/C and lane buses belong to neither displayed category, but they are still
  // at a known location and therefore cannot be Missing.
  const active = masterBuses.filter(countsTowardFleet).map((bus) => bus.num);
  const activeSet = new Set(active);
  const activeOffProperty = new Set([...offProperty].filter((bus) => activeSet.has(bus)));
  const isActiveOnProperty = (bus: string) => activeSet.has(bus) && !activeOffProperty.has(bus);
  const onGrid = new Set([...rawOnGrid].filter(isActiveOnProperty));
  const inLots = new Set([...rawInLots].filter(isActiveOnProperty));
  const inShop = new Set([...rawInShop].filter(isActiveOnProperty));
  const allLocated = new Set([...rawAllLocated].filter((bus) => activeSet.has(bus)));
  const activeInShopByFlag = new Set([...inShopByFlag].filter(isActiveOnProperty));
  const physicallyPlaced = new Set([...onGrid, ...allLocated]);
  const readyForService = new Set(onGrid);
  const notReadyForService = new Set(
    [...inLots, ...inShop, ...activeInShopByFlag].filter(
      (bus) => !readyForService.has(bus)
    )
  );
  const accounted = new Set([...physicallyPlaced, ...activeOffProperty, ...activeInShopByFlag]);
  const sortBuses = (list: string[]) => list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return {
    activeFleet: activeSet,
    onGrid,
    inLots,
    inShop,
    offProperty: activeOffProperty,
    readyForService,
    notReadyForService,
    accounted,
    missing: sortBuses(active.filter((bus) => !accounted.has(bus))),
    accountedByFlagOnly: sortBuses(active.filter((bus) => !physicallyPlaced.has(bus) && accounted.has(bus))),
  };
}
