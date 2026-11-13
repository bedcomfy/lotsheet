export const FUSION_ORIGIN = "https://iaymqy.fa.ocs.oraclecloud.com";
export const FUSION_HOME = `${FUSION_ORIGIN}/fscmUI/faces/FuseWelcome`;
export const FUSION_PROTOCOL = "lotsheet-fusion-v1";
export const FUSION_PAGE_SIZE = 25;

export const FUSION_RESOURCES = {
  workOrders: {
    label: "Work orders",
    singular: "Work order number",
    path: "maintenanceWorkOrders",
    searchField: "WorkOrderNumber",
    columns: [
      { key: "WorkOrderNumber", label: "Work order" },
      { key: "WorkOrderDescription", label: "Description" },
      { key: "WorkOrderStatus", label: "Status" },
      { key: "AssetNumber", label: "Asset" },
      { key: "PlannedStartDate", label: "Planned start", date: true },
      { key: "PlannedCompletionDate", label: "Planned completion", date: true },
    ],
  },
  assets: {
    label: "Assets",
    singular: "Asset number",
    path: "installedBaseAssets",
    searchField: "AssetNumber",
    columns: [
      { key: "AssetNumber", label: "Asset" },
      { key: "Description", label: "Description" },
      { key: "ItemNumber", label: "Item" },
      { key: "SerialNumber", label: "Serial number" },
      { key: "OperatingOrganizationCode", label: "Organization" },
      { key: "CurrentLocationName", label: "Location" },
    ],
  },
} as const;

export type FusionResource = keyof typeof FUSION_RESOURCES;
export type FusionCell = string | number | null;
export type FusionRow = Record<string, FusionCell>;

export interface FusionResult {
  resource: FusionResource;
  items: FusionRow[];
  offset: number;
  hasMore: boolean;
  expiresAt: number | null;
  fetchedAt: number;
}

export const FUSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FUSION_SEARCH_PATTERN = /^[A-Za-z0-9._ -]{0,64}$/;

export function isFusionResource(value: unknown): value is FusionResource {
  return typeof value === "string" && Object.hasOwn(FUSION_RESOURCES, value);
}

export function parseFusionResult(value: unknown): FusionResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (!isFusionResource(result.resource) ||
      !Array.isArray(result.items) || result.items.length > FUSION_PAGE_SIZE ||
      !Number.isInteger(result.offset) || (result.offset as number) < 0 ||
      (result.offset as number) > 10000 ||
      typeof result.hasMore !== "boolean" ||
      typeof result.fetchedAt !== "number" || !Number.isFinite(result.fetchedAt) ||
      (result.expiresAt !== null &&
        (typeof result.expiresAt !== "number" || !Number.isFinite(result.expiresAt)))) return null;

  const keys = FUSION_RESOURCES[result.resource].columns.map(column => column.key as string);
  const items: FusionRow[] = [];
  for (const item of result.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row: FusionRow = {};
    for (const key of keys) {
      const cell = (item as Record<string, unknown>)[key];
      if (cell == null) row[key] = null;
      else if (typeof cell === "string") row[key] = cell.slice(0, 4096);
      else if (typeof cell === "number" && Number.isFinite(cell)) row[key] = cell;
      else return null;
    }
    items.push(row);
  }
  return {
    resource: result.resource, items, offset: result.offset as number,
    hasMore: result.hasMore, expiresAt: result.expiresAt as number | null,
    fetchedAt: result.fetchedAt,
  };
}
