import { createHash } from "node:crypto";
import { FUSION_ORIGIN } from "./config";
import { FusionFailure, tokenExpiry } from "./server";
import type { CatalogSource, CatalogPart } from "./catalog";
import {
  NWD_ORGANIZATION_ID, NWD_ORGANIZATION_CODE, NWD_ORGANIZATION_NAME, PARTS_MAX_OFFSET, PARTS_PAGE_SIZE,
  type IndexKind, type Part, type PartBalance, type PartCharge, type PartLocation, type PartsPage,
} from "./parts";

const PREFIX = "/fscmRestApi/resources/11.13.18.05/";
const MAX_REST_BYTES = 4_000_000;
const MAX_REPORT_BYTES = 48_000_000;
const DEFINITIONS = {
  catalog: { path: "itemsV2", fields: "OrganizationId,OrganizationCode,ItemId,ItemNumber,ItemDescription,PrimaryUOMValue,ItemStatusValue", order: "ItemNumber:asc,ItemId:asc" },
  locations: { path: "locatorItems", fields: "OrganizationId,OrganizationCode,InventoryItemId,LocatorItemId,ItemNumber,SubinventoryCode,LocatorName", order: "LocatorItemId:asc" },
  subinventories: { path: "subinventoryItems", fields: "OrganizationId,OrganizationCode,InventoryItemId,SubinventoryItemId,ItemNumber,SecondaryInventory", order: "InventoryItemId:asc,SecondaryInventory:asc" },
  balances: { path: "inventoryOnhandBalances", fields: "OrganizationId,OrganizationCode,InventoryItemId,ItemNumber,SubinventoryCode,Locator,LocatorId,PrimaryQuantity,PrimaryUOMCode,PrimaryUnitOfMeasure,Revision,OwningPartySiteId,SummaryLevel", order: "InventoryItemId:asc,SubinventoryCode:asc,LocatorId:asc" },
} as const;
const HISTORY_FIELDS = "OrganizationId,TransactionId,InventoryTransactionReference,WorkOrderId,WorkOrderNumber,AssetNumber,ComponentItemId,OperationSequenceNumber,TransactionDate,TransactionType,Quantity,UnitOfMeasure,SubInventory,LocatorCode,CreatedBy,TransactionNote";
const MECHANIC_FIELDS = "OrganizationId,TransactionId,WorkOrderId,OperationSequenceNumber,TransactionType,ResourceName,ResourceInstance";
type Row = Record<string, unknown>;
function text(value: unknown, required = false): string | null {
  if (value == null || value === "") { if (required) throw new FusionFailure("FORMAT", 502); return null; }
  if (typeof value !== "string" || value.length > 4096) throw new FusionFailure("FORMAT", 502);
  return value;
}
function id(value: unknown, required = true): string | null {
  if (value == null && !required) return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new FusionFailure("FORMAT", 502);
  const string = String(value);
  if (!/^\d{1,18}$/.test(string)) throw new FusionFailure("FORMAT", 502);
  return string;
}
function number(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new FusionFailure("FORMAT", 502);
  return value;
}
function nwd(row: Row) {
  if (id(row.OrganizationId) !== NWD_ORGANIZATION_ID ||
      (row.OrganizationCode != null && row.OrganizationCode !== NWD_ORGANIZATION_CODE)) throw new FusionFailure("FORMAT", 502);
}
function expiry(token: string) {
  const exp = tokenExpiry(token);
  if (!exp) throw new FusionFailure("AUTH", 401);
  return exp;
}
async function limitedText(response: Response, max: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > max) throw new FusionFailure("FORMAT", 502);
  const reader = response.body?.getReader();
  if (!reader) throw new FusionFailure("FORMAT", 502);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > max) { await reader.cancel(); throw new FusionFailure("FORMAT", 502); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
async function oracle(token: string, path: string, options: RequestInit = {}, report = false) {
  expiry(token);
  const resource = path.split("?")[0].split("/").at(-1)!;
  let response: Response;
  try {
    response = await fetch(FUSION_ORIGIN + path, { ...options, method: report ? "POST" : "GET",
      credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(report ? 50_000 : 15_000),
      headers: { Authorization: "Bearer " + token, Accept: report ? "application/soap+xml" : "application/json",
        ...(report ? { "Content-Type": "application/soap+xml; charset=utf-8" } : { "REST-Framework-Version": "4" }) },
    });
  } catch { throw new FusionFailure("NETWORK", 502, { resource, stage: "request" }); }
  if (response.status === 401) throw new FusionFailure("AUTH", 401, { resource, upstreamStatus: 401 });
  if (response.status === 403) throw new FusionFailure("FORBIDDEN", 403, { resource, upstreamStatus: 403 });
  if (!response.ok) {
    const detail = response.status === 400 ? await limitedText(response, MAX_REST_BYTES).catch(() => "") : "";
    throw new FusionFailure("HTTP", 502, { resource, upstreamStatus: response.status,
      ...(detail.includes("EGP_MIN_ONE_FIELD_NEED_SEARCH") || detail.includes("EGP-2776154") ? { stage: "search-required" } : {}) });
  }
  let body: string;
  try { body = await limitedText(response, report ? MAX_REPORT_BYTES : MAX_REST_BYTES); }
  catch (error) { if (error instanceof FusionFailure) throw error; throw new FusionFailure("NETWORK", 502, { resource, stage: "response" }); }
  expiry(token); return body;
}
async function collection(token: string, path: string, query: URLSearchParams, offset: number) {
  let body: { items: Row[]; hasMore: boolean; offset?: number };
  try { body = JSON.parse(await oracle(token, PREFIX + path + "?" + query)); }
  catch (error) { if (error instanceof FusionFailure) throw error; throw new FusionFailure("FORMAT", 502, { resource: path, stage: "json" }); }
  if (!body || !Array.isArray(body.items) || body.items.length > PARTS_PAGE_SIZE || typeof body.hasMore !== "boolean" ||
      (body.offset != null && body.offset !== offset) || (body.hasMore && !body.items.length) ||
      body.items.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new FusionFailure("FORMAT", 502, { resource: path, stage: "collection" });
  try { body.items.forEach(nwd); } catch { throw new FusionFailure("FORMAT", 502, { resource: path, stage: "organization" }); }
  // Advance by actual returned rows, not the requested limit: Oracle may cap it.
  return { items: body.items, offset, nextOffset: offset + body.items.length,
    hasMore: body.hasMore, expiresAt: expiry(token), fetchedAt: Date.now(), connectionId: createHash("sha256").update(token).digest("hex") };
}
export function partsParameters(params: URLSearchParams) {
  const kind = params.get("kind");
  const allowed = kind === "history" ? ["kind", "itemId", "bus", "offset"] : ["kind", "offset"];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1) ||
      !["context", "catalog", "locations", "subinventories", "balances", "stock-report", "history"].includes(kind ?? "")) throw new FusionFailure("REQUEST", 400);
  const rawOffset = params.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!/^\d{1,7}$/.test(rawOffset) || offset > PARTS_MAX_OFFSET) throw new FusionFailure("REQUEST", 400);
  const itemId = params.get("itemId") ?? "";
  const bus = (params.get("bus") ?? "").trim();
  if (kind === "history" && (!/^(?:\d{1,18}|part:(?:[a-f0-9]{2}){1,1200})$/.test(itemId) || !/^[A-Za-z0-9._ -]{0,64}$/.test(bus))) throw new FusionFailure("REQUEST", 400);
  if (kind === "context" && offset !== 0) throw new FusionFailure("REQUEST", 400);
  return { kind: kind!, offset, itemId, bus };
}
export async function readPartsContext(token: string) {
  // A real stockroom read validates both the credential and NWD access before
  // a browser can restore its cached index. This is not a general app identity.
  const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}`, fields: "OrganizationId,OrganizationCode,InventoryItemId", limit: "1", onlyData: "true" });
  await collection(token, "subinventoryItems", query, 0);
  return { connectionId: createHash("sha256").update(token).digest("hex"), expiresAt: expiry(token), organization: "NWD" };
}
/** Fixed, one-row probes for private testing. Return shape/status only, never credentials or upstream error bodies. */
export async function diagnoseParts(token: string, kind: IndexKind) {
  const definition = DEFINITIONS[kind];
  const base = { q: `OrganizationId=${NWD_ORGANIZATION_ID}` + (kind === "balances" ? " and SummaryLevel='Locator'" : ""), limit: "1", onlyData: "true" };
  const probes = [
    { name: "minimal-default", query: new URLSearchParams(base), version: false },
    { name: "projected-default", query: new URLSearchParams({ ...base, fields: definition.fields }), version: false },
    { name: "projected-v4", query: new URLSearchParams({ ...base, fields: definition.fields }), version: true },
    { name: "ordered-v4", query: new URLSearchParams({ ...base, fields: definition.fields, orderBy: definition.order }), version: true },
  ];
  const results = [];
  for (const probe of probes) {
    expiry(token);
    let response: Response;
    try {
      response = await fetch(FUSION_ORIGIN + PREFIX + definition.path + "?" + probe.query, { method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(12_000), headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(probe.version ? { "REST-Framework-Version": "4" } : {}) } });
    } catch { results.push({ probe: probe.name, failure: "NETWORK" }); continue; }
    if (response.status === 401) throw new FusionFailure("AUTH", 401);
    const raw = await limitedText(response, MAX_REST_BYTES);
    let body: { items?: Row[]; hasMore?: unknown; offset?: unknown } | null = null;
    try { body = JSON.parse(raw); } catch {}
    const row = Array.isArray(body?.items) ? body!.items![0] : null;
    results.push({ probe: probe.name, status: response.status, json: body !== null, hasItems: Array.isArray(body?.items), hasMore: body?.hasMore, offset: body?.offset,
      fieldTypes: row && typeof row === "object" ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "null" : typeof value])) : null,
      organization: row ? { id: row.OrganizationId, code: row.OrganizationCode } : null,
      // Only report known schema field names mentioned by a failed request.
      mentionedFields: response.ok ? [] : definition.fields.split(",").filter(field => raw.includes(field)),
    });
  }
  return { resource: definition.path, organization: "NWD", probes: results };
}
export async function readPartsIndex(token: string, kind: IndexKind, offset: number): Promise<PartsPage<Part | PartLocation | PartBalance>> {
  const definition = DEFINITIONS[kind];
  const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}` + (kind === "balances" ? " and SummaryLevel='Locator'" : ""),
    fields: definition.fields, onlyData: "true", limit: String(PARTS_PAGE_SIZE), offset: String(offset), orderBy: definition.order });
  let page;
  try { page = await collection(token, definition.path, query, offset); }
  catch (error) {
    if (kind !== "catalog" || !(error instanceof FusionFailure) || error.diagnostic?.stage !== "search-required") throw error;
    if (offset !== 0) throw new FusionFailure("FORMAT", 502);
    const report = await northwestReport(token);
    return { ...reportPage(token, report.parts, report.fetchedAt), catalogSource: "buyers-report" };
  }
  return { ...page, items: page.items.map(row => {
    if (kind === "catalog") return { id: id(row.ItemId)!, number: text(row.ItemNumber, true)!, description: text(row.ItemDescription) ?? "",
      unit: text(row.PrimaryUOMValue), unitCode: text(row.PrimaryUOMCode), status: text(row.ItemStatusValue) } satisfies Part;
    if (kind === "locations" || kind === "subinventories") return {
      key: kind + ":" + String(kind === "locations" ? id(row.LocatorItemId) : text(row.SubinventoryItemId, true)),
      itemId: id(row.InventoryItemId)!, partNumber: text(row.ItemNumber, true)!,
      subinventory: text(kind === "locations" ? row.SubinventoryCode : row.SecondaryInventory),
      locator: kind === "locations" ? text(row.LocatorName) : null,
    } satisfies PartLocation;
    const itemId = id(row.InventoryItemId)!;
    return { key: JSON.stringify([itemId, row.SubinventoryCode, row.LocatorId, row.Revision, row.OwningPartySiteId]), itemId,
      partNumber: text(row.ItemNumber, true)!, subinventory: text(row.SubinventoryCode), locator: text(row.Locator),
      quantity: number(row.PrimaryQuantity), unit: text(row.PrimaryUnitOfMeasure), unitCode: text(row.PrimaryUOMCode), source: "onhand",
    } satisfies PartBalance;
  }) };
}
/** Manufacturer and trade numbers for every NWD stockroom item, with child paging. */
export async function readCatalogNumbers(token: string, offset: number) {
  const page = await collection(token, "subinventoryItems", new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}`,
    expand: "MPNs,GTINs", onlyData: "true", limit: String(PARTS_PAGE_SIZE), offset: String(offset), orderBy: "InventoryItemId:asc,SecondaryInventory:asc" }), offset);
  const items: NonNullable<CatalogSource["references"]> = [];
  for (const row of page.items) {
    const parent = text(row.SubinventoryItemId, true)!;
    if (!/^\d+_\d+$/.test(parent)) throw new FusionFailure("FORMAT", 502);
    const numbers: CatalogPart["numbers"] = [];
    for (const kind of ["MPNs", "GTINs"] as const) {
      let child = row[kind] as { items: Row[]; hasMore: boolean; offset?: number };
      let childOffset = 0;
      while (true) {
        if (!child || !Array.isArray(child.items) || typeof child.hasMore !== "boolean" || (child.hasMore && !child.items.length) || (child.offset != null && child.offset !== childOffset)) throw new FusionFailure("FORMAT", 502);
        for (const value of child.items) {
          const result = text(kind === "MPNs" ? value.MPN : value.GTIN, true)!;
          if (!numbers.some(n => n.type === (kind === "MPNs" ? "MPN" : "GTIN") && n.value === result)) numbers.push({ type: kind === "MPNs" ? "MPN" : "GTIN", value: result });
        }
        if (!child.hasMore) break;
        childOffset += child.items.length;
        if (childOffset > 10000) throw new FusionFailure("FORMAT", 502);
        child = JSON.parse(await oracle(token, PREFIX + "subinventoryItems/" + parent + "/child/" + kind + "?" + new URLSearchParams({ onlyData: "true", limit: "250", offset: String(childOffset) })));
      }
    }
    items.push({ partNumber: text(row.ItemNumber, true)!, itemId: id(row.InventoryItemId)!, unit: text(row.MinmaxQuantityUOMMeasure), numbers });
  }
  return { ...page, items };
}
export async function readPartHistory(token: string, itemId: string, bus: string, offset: number): Promise<PartsPage<PartCharge>> {
  if (itemId.startsWith("part:")) {
    const number = Buffer.from(itemId.slice(5), "hex").toString("utf8");
    if (!number || number.length > 300 || /[\x00-\x1f\x7f]/.test(number) || Buffer.from(number).toString("hex") !== itemId.slice(5)) throw new FusionFailure("REQUEST", 400);
    const match = await collection(token, "itemsV2", new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID} and ItemNumber='${number.replaceAll("'", "''")}'`,
      fields: "OrganizationId,OrganizationCode,ItemId,ItemNumber", limit: "2", onlyData: "true" }), 0);
    if (match.hasMore || match.items.length !== 1 || match.items[0].ItemNumber !== number) throw new FusionFailure("FORMAT", 502);
    itemId = id(match.items[0].ItemId)!;
  }
  const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID} and ComponentItemId=${itemId} and (TransactionType='MATERIAL_ISSUE' or TransactionType='MATERIAL_RETURN')` + (bus ? ` and AssetNumber='${bus}'` : ""),
    fields: HISTORY_FIELDS, onlyData: "true", limit: String(PARTS_PAGE_SIZE), offset: String(offset), orderBy: "TransactionDate:desc,TransactionId:desc" });
  const page = await collection(token, "maintenanceWorkOrderTransactionHistory", query, offset);
  const items: PartCharge[] = page.items.map(row => {
    if (id(row.ComponentItemId) !== itemId || (bus && row.AssetNumber !== bus) ||
        !["MATERIAL_ISSUE", "MATERIAL_RETURN"].includes(String(row.TransactionType))) throw new FusionFailure("FORMAT", 502);
    const transactionId = id(row.TransactionId)!;
    return { key: row.TransactionType + ":" + transactionId + ":" + String(row.InventoryTransactionReference ?? ""),
      transactionId, workOrderId: id(row.WorkOrderId)!, workOrder: text(row.WorkOrderNumber, true)!,
      bus: text(row.AssetNumber), operation: number(row.OperationSequenceNumber), date: text(row.TransactionDate),
      type: row.TransactionType as PartCharge["type"], quantity: number(row.Quantity), unit: text(row.UnitOfMeasure),
      subinventory: text(row.SubInventory), locator: text(row.LocatorCode), enteredBy: text(row.CreatedBy), note: text(row.TransactionNote),
      mechanics: [], mechanicStatus: "unavailable", unnamedMechanic: false,
    };
  });
  await addOperationMechanics(token, items);
  return { ...page, items };
}

/** Read posted mechanic labor for the exact work-order/operation pairs on this
 * material page. CreatedBy is a clerk/operator and must never supply a mechanic. */
async function addOperationMechanics(token: string, charges: PartCharge[]) {
  const key = (workOrderId: string, operation: number) => workOrderId + ":" + operation;
  const pairs = [...new Map(charges.filter(row => Number.isSafeInteger(row.operation) && row.operation! >= 0)
    .map(row => [key(row.workOrderId, row.operation!), { workOrderId: row.workOrderId, operation: row.operation! }])).entries()];
  let next = 0;
  const deadline = Date.now() + 30_000;
  const worker = async () => {
    while (next < pairs.length) {
      const start = next; next += 20;
      const batch = pairs.slice(start, next);
      const found = new Map(batch.map(([k]) => [k, { names: new Set<string>(), unnamed: false }]));
      const seen = new Set<string>();
      try {
        let offset = 0, more = true;
        while (more) {
          if (Date.now() >= deadline) throw new FusionFailure("NETWORK", 502);
          const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID} and TransactionType='RESOURCE_CHARGE' and (` +
            batch.map(([, pair]) => `(WorkOrderId=${pair.workOrderId} and OperationSequenceNumber=${pair.operation})`).join(" or ") + ")",
            fields: MECHANIC_FIELDS, onlyData: "true", limit: String(PARTS_PAGE_SIZE), offset: String(offset), orderBy: "TransactionId:asc" });
          const page = await collection(token, "maintenanceWorkOrderTransactionHistory", query, offset);
          for (const row of page.items) {
            const operation = number(row.OperationSequenceNumber), transaction = id(row.TransactionId)!;
            const group = operation === null ? null : found.get(key(id(row.WorkOrderId)!, operation));
            if (!group || row.TransactionType !== "RESOURCE_CHARGE" || seen.has(transaction)) throw new FusionFailure("FORMAT", 502);
            seen.add(transaction);
            // This tenant identifies mechanic labor by its Oracle resource name.
            if (!/mechanic/i.test(text(row.ResourceName) ?? "")) continue;
            const name = text(row.ResourceInstance)?.trim();
            if (name) group.names.add(name); else group.unnamed = true;
          }
          offset = page.nextOffset; more = page.hasMore;
          if (more && offset >= 5000) throw new FusionFailure("FORMAT", 502);
        }
        for (const charge of charges) {
          const group = charge.operation === null ? null : found.get(key(charge.workOrderId, charge.operation));
          if (!group) continue;
          charge.mechanics = [...group.names].sort((a, b) => a.localeCompare(b));
          charge.unnamedMechanic = group.unnamed; charge.mechanicStatus = "complete";
        }
      } catch (error) {
        if (error instanceof FusionFailure && error.code === "AUTH") throw error;
        // Preserve verified part charges if the separate labor read is unavailable.
        // A failed/partial labor read must not masquerade as no mechanics recorded.
      }
    }
  };
  await Promise.all([worker(), worker()]);
}

const STOCK_REPORT_PATH = "/Custom/Reports/ERP/Inventory/PACE_Buyers_Inventory_12_Month_Usage_Report - Layout 1.xdo";
export function stockReportEnvelope(partNumbers: string[]) {
  // Page through the NWD catalog so large inventories cannot truncate a single
  // enormous report. Numbers are selected by this server, never supplied by a caller.
  const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
  return `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:p="http://xmlns.oracle.com/oxp/service/PublicReportService" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body><p:runReport><p:reportRequest>
<p:XDOPropertyList xsi:nil="true"/><p:attributeCalendar xsi:nil="true"/><p:attributeFormat>html</p:attributeFormat><p:attributeLocale>en-US</p:attributeLocale><p:attributeTemplate xsi:nil="true"/><p:attributeTimezone>America/Chicago</p:attributeTimezone><p:attributeUILocale>en-US</p:attributeUILocale><p:byPassCache>true</p:byPassCache><p:dynamicDataSource xsi:nil="true"/><p:flattenXML>false</p:flattenXML>
<p:parameterNameValues><p:item><p:name>p_organization_name</p:name><p:values><p:item>${NWD_ORGANIZATION_NAME}</p:item></p:values></p:item><p:item><p:name>p_item_number</p:name><p:values>${partNumbers.map(n => `<p:item>${escapeXml(n)}</p:item>`).join("")}</p:values></p:item></p:parameterNameValues>
<p:reportAbsolutePath>${STOCK_REPORT_PATH}</p:reportAbsolutePath><p:reportData xsi:nil="true"/><p:reportOutputPath xsi:nil="true"/><p:reportRawData xsi:nil="true"/><p:sizeOfDataChunkDownload>-1</p:sizeOfDataChunkDownload></p:reportRequest></p:runReport></s:Body></s:Envelope>`;
}
function decodeCell(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, value: string) => {
    if (value[0] === "#") {
      const n = value[1].toLowerCase() === "x" ? parseInt(value.slice(2), 16) : Number(value.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[value.toLowerCase()];
  }).trim();
}
export function parseReportParts(html: string): Part[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => decodeCell(cell[1])));
  const start = rows.findIndex(row => row.includes("ITEM_NUMBER") && row.includes("OH_QTY"));
  if (start < 0) throw new FusionFailure("FORMAT", 502);
  const header = rows[start];
  if (!["DESCRIPTION", "ORGANIZATION_CODE"].every(key => header.includes(key))) throw new FusionFailure("FORMAT", 502);
  const parts = new Map<string, Part>();
  for (const cells of rows.slice(start + 1)) {
    const row = Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""]));
    if (!row.ITEM_NUMBER) continue;
    if (row.ORGANIZATION_CODE !== "NWD" || row.ITEM_NUMBER.length > 300) throw new FusionFailure("FORMAT", 502);
    const part = { id: "part:" + Buffer.from(row.ITEM_NUMBER).toString("hex"), number: row.ITEM_NUMBER, description: row.DESCRIPTION,
      unit: row.UNIT_OF_MEASURE || null, unitCode: null, status: null };
    if (parts.has(part.number) && JSON.stringify(parts.get(part.number)) !== JSON.stringify(part)) throw new FusionFailure("FORMAT", 502);
    parts.set(part.number, part);
  }
  if (!parts.size) throw new FusionFailure("FORMAT", 502);
  return [...parts.values()].sort((a, b) => a.number.localeCompare(b.number));
}
function reportPage<T>(token: string, items: T[], fetchedAt: number): PartsPage<T> {
  if (Buffer.byteLength(JSON.stringify(items)) > 3_500_000) throw new FusionFailure("FORMAT", 502);
  return { items, offset: 0, nextOffset: items.length, hasMore: false, fetchedAt, expiresAt: expiry(token), connectionId: createHash("sha256").update(token).digest("hex") };
}
// Business data only; credential-bound and briefly shared between the catalog and stock reads.
const reports = new Map<string, { until: number; value: Promise<{ parts: Part[]; balances: PartBalance[]; fetchedAt: number }> }>();
async function northwestReport(token: string) {
  await readPartsContext(token);
  const key = createHash("sha256").update(token).digest("hex");
  for (const [id, report] of reports) if (report.until <= Date.now()) reports.delete(id);
  const existing = reports.get(key); if (existing) return existing.value;
  const value = (async () => {
    const xml = await oracle(token, "/xmlpserver/services/ExternalReportWSSService", { body: stockReportEnvelope(["All"]) }, true);
    const encoded = xml.match(/<(?:\w+:)?reportBytes\b[^>]*>([A-Za-z0-9+/=\s]+)<\/(?:\w+:)?reportBytes>/)?.[1];
    if (!encoded) throw new FusionFailure("FORMAT", 502);
    const html = Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8");
    return { parts: parseReportParts(html), balances: parseStockReport(html), fetchedAt: Date.now() };
  })();
  if (reports.size >= 8) reports.delete(reports.keys().next().value!);
  reports.set(key, { until: Math.min(expiry(token), Date.now() + 60000), value });
  try { return await value; } catch (error) { reports.delete(key); throw error; }
}
export function parseStockReport(html: string): PartBalance[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => decodeCell(cell[1])));
  const headerIndex = rows.findIndex(row => row.includes("ITEM_NUMBER") && row.includes("OH_QTY"));
  if (headerIndex < 0) throw new FusionFailure("FORMAT", 502);
  const header = rows[headerIndex];
  const required = ["ITEM_NUMBER", "ORGANIZATION_CODE", "SUBINVENTORY_CODE", "SEGMENT1", "SEGMENT2", "SEGMENT3", "OH_QTY"];
  if (required.some(field => !header.includes(field)) || new Set(header).size !== header.length) throw new FusionFailure("FORMAT", 502);
  const items: PartBalance[] = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    if (!cells.length || cells.every(cell => !cell) || cells.join("|") === header.join("|")) continue;
    // Fail closed on changed/truncated layouts rather than claiming a complete index.
    if (cells.length !== header.length) throw new FusionFailure("FORMAT", 502);
    const row = Object.fromEntries(header.map((key, i) => [key, cells[i]]));
    if (!row.ITEM_NUMBER) continue; // The source's aggregate footer, never another item.
    if (row.ORGANIZATION_CODE !== "NWD" || row.ITEM_NUMBER.length > 300 || !/^-?\d+(?:\.\d+)?$/.test(row.OH_QTY.replaceAll(",", ""))) throw new FusionFailure("FORMAT", 502);
    const quantity = Number(row.OH_QTY.replaceAll(",", ""));
    if (!Number.isFinite(quantity)) throw new FusionFailure("FORMAT", 502);
    const locator = [row.SEGMENT1, row.SEGMENT2, row.SEGMENT3].filter(Boolean).join("-") || null;
    items.push({ key: JSON.stringify([row.ITEM_NUMBER, row.SUBINVENTORY_CODE, locator]), itemId: null, partNumber: row.ITEM_NUMBER,
      subinventory: row.SUBINVENTORY_CODE || null, locator, quantity, unit: null, unitCode: null, source: "buyers-report" });
  }
  // An empty or incomplete report is not a successful zero-stock index.
  if (!items.length || new Set(items.map(item => item.key)).size !== items.length) throw new FusionFailure("FORMAT", 502);
  return items;
}
export async function readStockReport(token: string, offset: number): Promise<PartsPage<PartBalance>> {
  let page;
  try { page = await collection(token, "itemsV2", new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}`,
    fields: "OrganizationId,OrganizationCode,ItemNumber", onlyData: "true", limit: "100", offset: String(offset), orderBy: "ItemNumber:asc,ItemId:asc" }), offset); }
  catch (error) {
    if (!(error instanceof FusionFailure) || error.diagnostic?.stage !== "search-required") throw error;
    if (offset !== 0) throw new FusionFailure("FORMAT", 502);
    const report = await northwestReport(token);
    return reportPage(token, report.balances, report.fetchedAt);
  }
  const numbers = page.items.map(row => text(row.ItemNumber, true)!);
  if (!numbers.length) return { ...page, items: [] };
  const xml = await oracle(token, "/xmlpserver/services/ExternalReportWSSService", { body: stockReportEnvelope(numbers) }, true);
  if (/<(?:\w+:)?Fault\b/.test(xml)) throw new FusionFailure("HTTP", 502);
  const encoded = xml.match(/<(?:\w+:)?reportBytes\b[^>]*>([A-Za-z0-9+/=\s]+)<\/(?:\w+:)?reportBytes>/)?.[1];
  if (!encoded) throw new FusionFailure("FORMAT", 502);
  const items = parseStockReport(Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8"));
  const requested = new Set(numbers), returned = new Set(items.map(row => row.partNumber));
  if (items.some(row => !requested.has(row.partNumber)) || numbers.some(n => !returned.has(n))) throw new FusionFailure("FORMAT", 502);
  // Keep the application response below hosting limits; never silently truncate.
  if (Buffer.byteLength(JSON.stringify(items)) > 3_500_000) throw new FusionFailure("FORMAT", 502);
  return { ...page, items, fetchedAt: Date.now(), expiresAt: expiry(token) };
}
