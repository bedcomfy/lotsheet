/** Public, credential-free view models for the Northwest parts reader. */
export const NWD_ORGANIZATION_ID = "300000004581674";
export const NWD_ORGANIZATION_CODE = "NWD";
export const NWD_ORGANIZATION_NAME = "Pace Northwest Division";
export const PARTS_PAGE_SIZE = 250;
export const PARTS_MAX_OFFSET = 1_000_000;
export const PARTS_CACHE_AGE = 15 * 60 * 1000;
export type IndexKind = "catalog" | "locations" | "subinventories" | "balances";
export type LoadStatus = "idle" | "loading" | "complete" | "error";
export interface Part {
  id: string; number: string; description: string; unit: string | null;
  unitCode: string | null; status: string | null;
}
export interface PartLocation {
  key: string; itemId: string; partNumber: string; subinventory: string | null; locator: string | null;
}
export interface PartBalance {
  key: string; itemId: string | null; partNumber: string; subinventory: string | null; locator: string | null;
  quantity: number | null; unit: string | null; unitCode: string | null;
  source: "onhand" | "buyers-report";
}
export interface PartCharge {
  key: string; transactionId: string; workOrderId: string; workOrder: string;
  bus: string | null; operation: number | null; date: string | null;
  type: "MATERIAL_ISSUE" | "MATERIAL_RETURN"; quantity: number | null; unit: string | null;
  subinventory: string | null; locator: string | null; enteredBy: string | null; note: string | null;
}
export interface PartsPage<T> {
  items: T[]; offset: number; nextOffset: number; hasMore: boolean; fetchedAt: number; expiresAt: number; connectionId: string;
}
export interface IndexProgress {
  status: LoadStatus; offset: number; fetchedAt: number | null; error: string | null;
}
export interface PartsIndex {
  version: 1; connectionId: string; expiresAt: number; startedAt: number;
  parts: Part[]; locations: PartLocation[]; subinventories: PartLocation[]; balances: PartBalance[];
  progress: Record<IndexKind, IndexProgress>;
  stockSource: "onhand" | "buyers-report" | null;
}
export function emptyPartsIndex(connectionId: string, expiresAt: number): PartsIndex {
  const stage = (): IndexProgress => ({ status: "idle", offset: 0, fetchedAt: null, error: null });
  return { version: 1, connectionId, expiresAt, startedAt: Date.now(), parts: [], locations: [], subinventories: [], balances: [],
    progress: { catalog: stage(), locations: stage(), subinventories: stage(), balances: stage() }, stockSource: null };
}
export function indexIsComplete(index: PartsIndex) {
  return Object.values(index.progress).every(stage => stage.status === "complete");
}
export function findParts(parts: Part[], text: string, limit = 40): Part[] {
  const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return parts.slice(0, limit);
  return parts.filter(part => {
    const haystack = (part.number + " " + part.description).toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => {
    const query = text.trim().toLocaleLowerCase();
    const rank = (p: Part) => p.number.toLocaleLowerCase() === query ? 0 : p.number.toLocaleLowerCase().startsWith(query) ? 1 : 2;
    return rank(a) - rank(b) || a.number.localeCompare(b.number, undefined, { numeric: true });
  }).slice(0, limit);
}
export function uniqueByKey<T extends { key: string }>(rows: T[]): T[] {
  return [...new Map(rows.map(row => [row.key, row])).values()];
}
export function partLocations(index: PartsIndex, part: Part): PartLocation[] {
  const locators = index.locations.filter(row => row.itemId === part.id);
  const assigned = new Set(locators.map(row => row.subinventory));
  return [...locators, ...index.subinventories.filter(row => row.itemId === part.id && !assigned.has(row.subinventory))];
}
export function partBalances(index: PartsIndex, part: Part): PartBalance[] {
  return index.balances.filter(row => row.itemId === part.id || (row.itemId === null && row.partNumber === part.number));
}
/** Do not aggregate across unknown or different units, or infer missing stock as zero. */
export function balanceTotal(rows: PartBalance[]): { quantity: number; unit: string } | null {
  if (!rows.length || rows.some(row => row.source !== "onhand" || row.quantity === null || !row.unit)) return null;
  if (new Set(rows.map(row => row.unitCode || row.unit)).size !== 1) return null;
  return { quantity: rows.reduce((sum, row) => sum + row.quantity!, 0), unit: rows[0].unit! };
}
