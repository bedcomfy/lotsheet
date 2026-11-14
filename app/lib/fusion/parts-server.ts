import { createHash } from "node:crypto";
import { FUSION_ORIGIN } from "./config";
import { FusionFailure, tokenExpiry } from "./server";
import {
  NWD_ORGANIZATION_ID, NWD_ORGANIZATION_CODE, NWD_ORGANIZATION_NAME, PARTS_MAX_OFFSET, PARTS_PAGE_SIZE,
  type IndexKind, type Part, type PartBalance, type PartCharge, type PartLocation, type PartsPage,
} from "./parts";

const PREFIX = "/fscmRestApi/resources/11.13.18.05/";
const MAX_REST_BYTES = 4_000_000;
const MAX_REPORT_BYTES = 48_000_000;
const DEFINITIONS = {
  catalog: { path: "itemsV2", fields: "OrganizationId,OrganizationCode,ItemId,ItemNumber,ItemDescription,PrimaryUOMCode,PrimaryUOMValue,ItemStatusValue", order: "ItemNumber:asc,ItemId:asc" },
  locations: { path: "locatorItems", fields: "OrganizationId,OrganizationCode,InventoryItemId,LocatorItemId,ItemNumber,SubinventoryCode,LocatorName", order: "LocatorItemId:asc" },
  subinventories: { path: "subinventoryItems", fields: "OrganizationId,OrganizationCode,InventoryItemId,SubinventoryItemId,ItemNumber,SecondaryInventory", order: "InventoryItemId:asc,SecondaryInventory:asc" },
  balances: { path: "inventoryOnhandBalances", fields: "OrganizationId,OrganizationCode,InventoryItemId,ItemNumber,SubinventoryCode,Locator,LocatorId,PrimaryQuantity,PrimaryUOMCode,PrimaryUnitOfMeasure,Revision,OwningPartySiteId,SummaryLevel", order: "InventoryItemId:asc,SubinventoryCode:asc,LocatorId:asc" },
} as const;
const HISTORY_FIELDS = "OrganizationId,TransactionId,InventoryTransactionReference,WorkOrderId,WorkOrderNumber,AssetNumber,ComponentItemId,OperationSequenceNumber,TransactionDate,TransactionType,Quantity,UnitOfMeasure,SubInventory,LocatorCode,CreatedBy,TransactionNote";
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
  if (!response.ok) throw new FusionFailure("HTTP", 502, { resource, upstreamStatus: response.status });
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
  if (kind === "history" && (!/^\d{1,18}$/.test(itemId) || !/^[A-Za-z0-9._ -]{0,64}$/.test(bus))) throw new FusionFailure("REQUEST", 400);
  if (kind === "context" && offset !== 0) throw new FusionFailure("REQUEST", 400);
  return { kind: kind!, offset, itemId, bus };
}
export async function readPartsContext(token: string) {
  // A real catalog read validates both the credential and NWD item access before
  // a browser can restore its cached index. This is not a general app identity.
  const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}`, fields: "OrganizationId,OrganizationCode,ItemId", limit: "1", onlyData: "true" });
  await collection(token, "itemsV2", query, 0);
  return { connectionId: createHash("sha256").update(token).digest("hex"), expiresAt: expiry(token), organization: "NWD" };
}
/** Fixed, one-row probes for private testing. Return shape/status only, never credentials or upstream error bodies. */
export async function diagnoseParts(token: string, kind: IndexKind) {
  const definition = DEFINITIONS[kind];
  const base = { q: `OrganizationId=${NWD_ORGANIZATION_ID}` + (kind === "balances" ? ";SummaryLevel='Locator'" : ""), limit: "1", onlyData: "true" };
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
  const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}` + (kind === "balances" ? ";SummaryLevel='Locator'" : ""),
    fields: definition.fields, onlyData: "true", limit: String(PARTS_PAGE_SIZE), offset: String(offset), orderBy: definition.order });
  const page = await collection(token, definition.path, query, offset);
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
export async function readPartHistory(token: string, itemId: string, bus: string, offset: number): Promise<PartsPage<PartCharge>> {
  const query = new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID} and ComponentItemId=${itemId} and (TransactionType='MATERIAL_ISSUE' or TransactionType='MATERIAL_RETURN')` + (bus ? ` and AssetNumber='${bus}'` : ""),
    fields: HISTORY_FIELDS, onlyData: "true", limit: String(PARTS_PAGE_SIZE), offset: String(offset), orderBy: "TransactionDate:desc,TransactionId:desc" });
  const page = await collection(token, "maintenanceWorkOrderTransactionHistory", query, offset);
  return { ...page, items: page.items.map(row => {
    if (id(row.ComponentItemId) !== itemId || (bus && row.AssetNumber !== bus) ||
        !["MATERIAL_ISSUE", "MATERIAL_RETURN"].includes(String(row.TransactionType))) throw new FusionFailure("FORMAT", 502);
    const transactionId = id(row.TransactionId)!;
    return { key: row.TransactionType + ":" + transactionId + ":" + String(row.InventoryTransactionReference ?? ""),
      transactionId, workOrderId: id(row.WorkOrderId)!, workOrder: text(row.WorkOrderNumber, true)!,
      bus: text(row.AssetNumber), operation: number(row.OperationSequenceNumber), date: text(row.TransactionDate),
      type: row.TransactionType as PartCharge["type"], quantity: number(row.Quantity), unit: text(row.UnitOfMeasure),
      subinventory: text(row.SubInventory), locator: text(row.LocatorCode), enteredBy: text(row.CreatedBy), note: text(row.TransactionNote),
    };
  }) };
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
  const page = await collection(token, "itemsV2", new URLSearchParams({ q: `OrganizationId=${NWD_ORGANIZATION_ID}`,
    fields: "OrganizationId,OrganizationCode,ItemNumber", onlyData: "true", limit: "100", offset: String(offset), orderBy: "ItemNumber:asc,ItemId:asc" }), offset);
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
