import type { Part, PartLocation } from "./parts";

export interface CatalogLocation { stockroom: string | null; locator: string | null }
export interface CatalogPart {
  number: string; name: string; description: string; itemIds: string[];
  numbers: { type: "MPN" | "GTIN"; value: string }[];
  unit: string | null; status: string | null; locations: CatalogLocation[];
}
export interface SavedCatalog {
  version: 1; organization: "NWD"; organizationId: "300000004581674";
  startedAt: number; fetchedAt: number; parts: CatalogPart[];
  sourceCounts: { parts: number; locators: number; stockrooms: number; reportLocations: number };
}
export interface CatalogSource {
  startedAt: number; fetchedAt: number; parts: Part[]; locations: PartLocation[];
  subinventories: PartLocation[];
  reportLocations: { itemId: string | null; partNumber: string; subinventory: string | null; locator: string | null }[];
  references?: { partNumber: string; itemId: string; unit: string | null; numbers: CatalogPart["numbers"] }[];
}
/** Persist only catalog business fields. No credentials, balances, or charge rows. */
export function buildSavedCatalog(source: CatalogSource): SavedCatalog {
  if (!source.parts.length || !Number.isFinite(source.fetchedAt) || source.fetchedAt < source.startedAt) throw Error("Incomplete catalog");
  const rows = new Map<string, CatalogPart>();
  for (const part of source.parts) {
    if (!part.number || rows.has(part.number)) throw Error("Duplicate or missing part number");
    rows.set(part.number, { number: part.number, name: part.description.split(":")[0].trim() || part.number,
      description: part.description, itemIds: /^\d+$/.test(part.id) ? [part.id] : [], numbers: [], unit: part.unit || part.unitCode,
      status: part.status, locations: [] });
  }
  for (const assignment of [...source.locations, ...source.subinventories, ...source.reportLocations]) {
    let part = rows.get(assignment.partNumber);
    // Retain an NWD assignment even when its item is missing from the report.
    if (!part) { part = { number: assignment.partNumber, name: assignment.partNumber, description: "", itemIds: [], numbers: [], unit: null, status: null, locations: [] }; rows.set(part.number, part); }
    if (assignment.itemId && /^\d+$/.test(assignment.itemId) && !part.itemIds.includes(assignment.itemId)) part.itemIds.push(assignment.itemId);
    if ((assignment.subinventory || assignment.locator) && !part.locations.some(l => l.stockroom === assignment.subinventory && l.locator === assignment.locator))
      part.locations.push({ stockroom: assignment.subinventory, locator: assignment.locator });
  }
  for (const ref of source.references ?? []) {
    const part = rows.get(ref.partNumber); if (!part) throw Error("Unmatched part reference");
    if (!part.itemIds.includes(ref.itemId)) part.itemIds.push(ref.itemId);
    for (const number of ref.numbers) if (!part.numbers.some(n => n.type === number.type && n.value === number.value)) part.numbers.push(number);
  }
  for (const part of rows.values()) {
    part.locations = part.locations.filter(l => l.locator || !part.locations.some(other => other.stockroom === l.stockroom && other.locator));
    part.locations.sort((a, b) => `${a.stockroom ?? ""} ${a.locator ?? ""}`.localeCompare(`${b.stockroom ?? ""} ${b.locator ?? ""}`, undefined, { numeric: true }));
    part.itemIds.sort();
  }
  return { version: 1, organization: "NWD", organizationId: "300000004581674", startedAt: source.startedAt, fetchedAt: source.fetchedAt,
    parts: [...rows.values()].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    sourceCounts: { parts: source.parts.length, locators: source.locations.length, stockrooms: source.subinventories.length, reportLocations: source.reportLocations.length } };
}
export type CatalogSort = "number" | "name" | "description" | "location";
export function browseCatalog(parts: CatalogPart[], search: string, location: string, sort: CatalogSort, descending = false) {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean), place = location.trim().toLocaleLowerCase();
  const locationText = (p: CatalogPart) => p.locations.map(l => [l.stockroom, l.locator].filter(Boolean).join(" / ")).join("; ");
  return parts.filter(p => {
    const locations = locationText(p).toLocaleLowerCase();
    const text = `${p.number} ${p.name} ${p.description} ${p.itemIds.join(" ")} ${(p.numbers ?? []).map(n => n.value).join(" ")} ${locations}`.toLocaleLowerCase();
    return words.every(word => text.includes(word)) && (!place || (place === "__unassigned__" ? !p.locations.length : locations.includes(place)));
  }).sort((a, b) => {
    const first = sort === "location" ? locationText(a) : a[sort], second = sort === "location" ? locationText(b) : b[sort];
    return (first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" }) || a.number.localeCompare(b.number, undefined, { numeric: true })) * (descending ? -1 : 1);
  });
}
