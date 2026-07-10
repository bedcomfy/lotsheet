import type { FlagMap, LotKey, LotSheet, MasterBus } from "./types";

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

// One definition of the fleet totals used everywhere:
// lots = North + East + Fence; shop = Apron + Bays + Cards. Off-property and
// in-shop flags keep an unplaced bus accounted for without inflating a physical
// location count.
export function fleetStats(
  sheet: LotSheet | null | undefined,
  flags: FlagMap | null | undefined,
  masterBuses: MasterBus[] = []
): FleetStats {
  const onGrid = new Set<string>();
  for (const value of Object.values(sheet?.cells || {})) {
    const bus = cellBus(value);
    if (bus && bus !== "X") onGrid.add(bus);
  }

  const inLots = busesInLocations(sheet, LOT_COUNT_KEYS);
  const inShop = busesInLocations(sheet, SHOP_COUNT_KEYS);
  const allLocated = busesInLocations(sheet, ALL_LOCATION_KEYS);
  const offProperty = new Set<string>();
  const inShopByFlag = new Set<string>();
  for (const [bus, entry] of Object.entries(flags || {})) {
    if ((entry.flags || []).includes("offprop")) offProperty.add(bus);
    if ((entry.flags || []).includes("shop")) inShopByFlag.add(bus);
  }

  // R/C and lane buses belong to neither displayed category, but they are still
  // at a known location and therefore cannot be Missing.
  const physicallyPlaced = new Set([...onGrid, ...allLocated]);
  const active = masterBuses.filter((bus) => bus.status !== "retired").map((bus) => bus.num);
  const activeSet = new Set(active);
  const activeOffProperty = new Set([...offProperty].filter((bus) => activeSet.has(bus)));
  const readyForService = new Set([...onGrid].filter((bus) => activeSet.has(bus)));
  const notReadyForService = new Set(
    [...inLots, ...inShop, ...inShopByFlag, ...activeOffProperty].filter(
      (bus) => activeSet.has(bus) && !readyForService.has(bus)
    )
  );
  const accounted = new Set([...physicallyPlaced, ...offProperty, ...inShopByFlag]);
  const sortBuses = (list: string[]) => list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return {
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
