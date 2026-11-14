import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPartsIndex, balanceTotal, findParts, indexIsComplete, type PartBalance } from "./parts";
import { usableCache, type PartsCache } from "./parts-cache";
import { PartsClient, INITIAL_PARTS_STATE, type PartsSnapshot } from "./parts-client";

const connectionId = "a".repeat(64);
const part = { id: "123", number: "910090", description: "ENGINE COOLANT BULK", unit: "Quart", unitCode: "QT", status: "Active" };
const other = { ...part, id: "124", number: "910103", description: "COOLANT PREMIX" };
const row = { key: "1", workOrderId: "1", workOrder: "NWD-1680", bus: "6403", type: "MATERIAL_ISSUE" };
const page = (items: unknown[], offset = 0, hasMore = false) => ({ items, offset, nextOffset: offset + items.length, hasMore, fetchedAt: Date.now(), expiresAt: Date.now() + 14400000, connectionId });
const cache = (): PartsCache => ({ load: vi.fn().mockResolvedValue(null), save: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) });
function fixture(override?: (kind: string, offset: number, url: URL) => Promise<Response> | Response | undefined) {
  let state: PartsSnapshot = INITIAL_PARTS_STATE;
  const fetch = vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
    const url = new URL(String(input), "https://nwmaint.app"), kind = url.searchParams.get("kind")!, offset = Number(url.searchParams.get("offset") ?? 0);
    const custom = override?.(kind, offset, url); if (custom) return custom;
    if (kind === "context") return Response.json({ connectionId, organization: "NWD", expiresAt: Date.now() + 14400000 });
    return Response.json(page(kind === "catalog" ? [part, other] : [], offset));
  });
  const storage = cache(); const client = new PartsClient(fetch, storage, next => { state = next; });
  return { client, fetch, cache: storage, state: () => state };
}
afterEach(() => vi.useRealTimers());
describe("parts discovery and completeness", () => {
  it("searches descriptions by multiple partial words and exact part numbers", () => {
    expect(findParts([part, other], "cool eng")).toEqual([part]);
    expect(findParts([part, other], "910103")).toEqual([other]);
    expect(findParts([part], "no match")).toEqual([]);
  });
  it("does not infer zero or total quantities across unknown, report or different units", () => {
    const stock = { quantity: 5, unit: "Quart", unitCode: "QT", source: "onhand" } as PartBalance;
    expect(balanceTotal([])).toBeNull();
    expect(balanceTotal([stock, { ...stock, quantity: 0 }])).toEqual({ quantity: 5, unit: "Quart" });
    expect(balanceTotal([stock, { ...stock, unitCode: "GAL", unit: "Gallon" }])).toBeNull();
    expect(balanceTotal([{ ...stock, source: "buyers-report" }])).toBeNull();
    expect(balanceTotal([{ ...stock, quantity: null }])).toBeNull();
  });
  it("follows Oracle's actual offsets until exhaustion, never stops at the first page", async () => {
    const f = fixture((kind, offset) => kind === "catalog" ? Response.json(page(offset === 0 ? [part] : [other], offset, offset === 0)) : undefined);
    await f.client.connect();
    expect(f.state().index?.parts).toEqual([part, other]);
    expect(indexIsComplete(f.state().index!)).toBe(true);
    expect(f.cache.save).toHaveBeenCalledTimes(1);
    expect(f.fetch.mock.calls.some(([url]) => String(url).includes("kind=catalog&offset=1"))).toBe(true);
    expect(f.fetch.mock.calls.filter(([url]) => !String(url).includes("kind=context")).every(([, options]) =>
      new Headers(options?.headers).get("X-Lotsheet-Fusion-Connection") === connectionId)).toBe(true);
    f.client.dispose();
  });
  it("rejects repeated pages as incomplete instead of quietly dropping duplicates", async () => {
    const f = fixture((kind, offset) => kind === "catalog" ? Response.json(page([part], offset, true)) : undefined);
    await f.client.connect();
    expect(f.state().index?.progress.catalog.status).toBe("error");
    expect(f.state().index?.parts).toHaveLength(1);
    expect(f.cache.save).not.toHaveBeenCalled(); f.client.dispose();
  });
  it("distinguishes an Oracle query rejection from an authentication or network failure", async () => {
    const f = fixture(kind => kind === "context" ? Response.json({ code: "HTTP", diagnostic: { resource: "itemsV2", upstreamStatus: 400 } }, { status: 502 }) : undefined);
    await f.client.connect();
    expect(f.state()).toMatchObject({ status: "error", error: "Oracle rejected this data request. Your connection may still be valid. (itemsV2, HTTP 400)" });
    f.client.dispose();
  });
  it("paginates the fixed report after an on-hand denial", async () => {
    const f = fixture((kind, offset) => kind === "balances" ? Response.json({}, { status: 403 }) : kind === "stock-report" ?
      Response.json({ ...page([{ key: String(offset), partNumber: "910090", source: "buyers-report" }], offset, offset === 0), nextOffset: offset + 100 }) : undefined);
    await f.client.connect();
    expect(f.state().index?.stockSource).toBe("buyers-report");
    expect(f.state().index?.balances).toHaveLength(2);
    expect(f.state().index?.progress.balances.status).toBe("complete"); f.client.dispose();
  });
  it("clears all business results if any request returns unauthorized", async () => {
    const f = fixture(kind => kind === "history" ? Response.json({}, { status: 401 }) : undefined);
    await f.client.connect(); await f.client.selectPart(part.id);
    expect(f.state()).toMatchObject({ status: "disconnected", index: null, history: { rows: [] } });
    f.client.dispose();
  });
  it("discards a late response for a previously selected part", async () => {
    let complete!: (response: Response) => void;
    const f = fixture((kind, _, url) => kind !== "history" ? undefined : url.searchParams.get("itemId") === part.id ? new Promise(resolve => { complete = resolve; }) : Response.json(page([{ ...row, key: "2", workOrder: "NWD-1676" }])));
    await f.client.connect(); const first = f.client.selectPart(part.id);
    await f.client.selectPart(other.id); complete(Response.json(page([row]))); await first;
    expect(f.state().history).toMatchObject({ partId: other.id, rows: [{ workOrder: "NWD-1676" }], status: "complete" }); f.client.dispose();
  });
  it("refuses data returned under a replacement connection and expires without Fusion open", async () => {
    const f = fixture(kind => kind === "history" ? Response.json({ ...page([row]), connectionId: "b".repeat(64) }) : undefined);
    await f.client.connect(); await f.client.selectPart(part.id);
    expect(f.state().status).toBe("disconnected"); f.client.dispose();
    vi.useFakeTimers(); const g = fixture(); await g.client.connect(); await vi.advanceTimersByTimeAsync(14400001);
    expect(g.state()).toMatchObject({ status: "disconnected", index: null }); g.client.dispose();
  });
  it("binds a cached inventory to a validated connection, freshness and expiry", () => {
    const index = emptyPartsIndex(connectionId, Date.now() + 10000);
    Object.values(index.progress).forEach(s => { s.status = "complete"; });
    expect(usableCache(index, connectionId)).toBe(true);
    expect(usableCache(index, "different")).toBe(false);
    expect(usableCache({ ...index, startedAt: Date.now() - 900001 }, connectionId)).toBe(false);
    expect(usableCache({ ...index, expiresAt: Date.now() - 1 }, connectionId)).toBe(false);
  });
});
