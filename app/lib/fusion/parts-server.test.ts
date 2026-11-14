import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../api/fusion/parts/route";
import { FUSION_COOKIE } from "./server";
import { FUSION_REQUEST_HEADER, FUSION_ORIGIN } from "./config";
import { NWD_ORGANIZATION_ID } from "./parts";
import { parseStockReport, partsParameters, readPartHistory, readPartsIndex, readStockReport, stockReportEnvelope } from "./parts-server";

const token = () => "e30." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 14400 })).toString("base64url") + ".synthetic";
const org = { OrganizationId: Number(NWD_ORGANIZATION_ID), OrganizationCode: "NWD" };
const item = { ...org, ItemId: 100000024478060, ItemNumber: "910090", ItemDescription: "ENGINE COOLANT", PrimaryUOMCode: "QT", PrimaryUOMValue: "Quart", ItemStatusValue: "Active" };
const charge = { ...org, TransactionId: 30000001, ComponentItemId: item.ItemId, WorkOrderId: 30000002, WorkOrderNumber: "NWD-1680", AssetNumber: "6403", TransactionType: "MATERIAL_ISSUE", Quantity: 22, UnitOfMeasure: "Quart", OperationSequenceNumber: 10 };
const html = readFileSync(new URL("./fixtures/nwd-coolant-stock.html", import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());
describe("Northwest read boundary", () => {
  it("requires a same-origin authenticated request, exposes no generic query or write path", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await GET(new Request("https://nwmaint.app/api/fusion/parts?kind=catalog"))).status).toBe(403);
    expect((await GET(new Request("https://nwmaint.app/api/fusion/parts?kind=catalog", { headers: { [FUSION_REQUEST_HEADER]: "1" } }))).status).toBe(401);
    for (const query of ["kind=history&itemId=1%20or%201=1", "kind=history&itemId=1&bus=6403%27", "kind=catalog&q=OrganizationId=9", "kind=catalog&offset=-1", "kind=catalog&kind=history", "kind=unknown", "kind=stock-report&path=/other"]) {
      expect(() => partsParameters(new URLSearchParams(query))).toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("pins organization, strips unselected fields, and advances by actual page size", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [{ ...item, privateField: "do-not-return" }], offset: 250, hasMore: true })); vi.stubGlobal("fetch", fetch);
    const page = await readPartsIndex(token(), "catalog", 250);
    expect(page).toMatchObject({ nextOffset: 251, hasMore: true, items: [{ id: String(item.ItemId), number: "910090", unit: "Quart" }] });
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).origin).toBe(FUSION_ORIGIN);
    expect(new URL(url).searchParams.get("q")).toBe("OrganizationId=" + NWD_ORGANIZATION_ID);
    expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "error", cache: "no-store" });
    expect(init.headers.Cookie).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(/do-not-return|synthetic|Authorization/);
  });
  it.each([
    { items: [{ ...item, OrganizationId: 123 }], hasMore: false },
    { items: [{ ...item, OrganizationCode: "OTHER" }], hasMore: false },
    { items: [], hasMore: true },
    { items: [item], hasMore: false, offset: 5 },
  ])("rejects foreign, mismatched or nonadvancing data", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(readPartsIndex(token(), "catalog", 0)).rejects.toMatchObject({ code: "FORMAT" });
  });
  it("requests actual material transactions for a component and exact bus; rejects an unrelated component", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [charge], hasMore: false }))
      .mockResolvedValueOnce(Response.json({ items: [{ ...charge, ComponentItemId: 9 }], hasMore: false })); vi.stubGlobal("fetch", fetch);
    const page = await readPartHistory(token(), String(item.ItemId), "6403", 0);
    const q = new URL(fetch.mock.calls[0][0]).searchParams.get("q");
    expect(q).toContain("ComponentItemId=" + item.ItemId);
    expect(q).toContain("AssetNumber='6403'");
    expect(q).toContain("MATERIAL_RETURN");
    expect(q).toContain("OrganizationId=" + NWD_ORGANIZATION_ID);
    expect(page.items[0]).toMatchObject({ workOrder: "NWD-1680", bus: "6403", type: "MATERIAL_ISSUE", quantity: 22 });
    await expect(readPartHistory(token(), String(item.ItemId), "6403", 0)).rejects.toMatchObject({ code: "FORMAT" });
  });
  it("does not forward Oracle error bodies or serve an expired credential", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ secret: "never-return" }, { status: 401 })); vi.stubGlobal("fetch", fetch);
    const response = await GET(new Request("https://nwmaint.app/api/fusion/parts?kind=catalog", { headers: { [FUSION_REQUEST_HEADER]: "1", cookie: FUSION_COOKIE + "=" + token() } }));
    expect(response.status).toBe(401); expect(await response.text()).not.toContain("never-return");
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(readPartsIndex("expired", "catalog", 0)).rejects.toMatchObject({ code: "AUTH" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe("Northwest report fallback", () => {
  it("parses the previously captured Oracle HTML with unconfirmed stock units", () => {
    const rows = parseStockReport(html);
    expect(rows).toHaveLength(5);
    expect(rows.find(row => row.partNumber === "910090")).toMatchObject({ quantity: 3060.47, source: "buyers-report", unit: null, itemId: null });
    expect(rows.some(row => row.quantity === 0)).toBe(true);
    expect(() => parseStockReport(html.replaceAll(">NWD<", ">OTHER<"))).toThrow();
    expect(() => parseStockReport(html.replaceAll("OH_QTY", "OH_OLD"))).toThrow();
  });
  it("reads a bounded server-selected NWD item batch and checks every requested item returned", async () => {
    const numbers = parseStockReport(html).map(row => row.partNumber);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: numbers.map(ItemNumber => ({ ...org, ItemNumber })), hasMore: true, offset: 100 }))
      .mockResolvedValueOnce(new Response(`<reportBytes>${Buffer.from(html).toString("base64")}</reportBytes>`)); vi.stubGlobal("fetch", fetch);
    const page = await readStockReport(token(), 100);
    expect(page).toMatchObject({ offset: 100, nextOffset: 105, hasMore: true });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe(FUSION_ORIGIN + "/xmlpserver/services/ExternalReportWSSService");
    expect(init.method).toBe("POST"); // Fixed read-only BI runReport, never business mutation.
    expect(init.body).toContain("Pace Northwest Division");
    expect(init.body).not.toContain(">All<");
    expect(init.body).toContain("<p:runReport>");
    expect(stockReportEnvelope(["A&B"])).toContain("A&amp;B");
  });
});
