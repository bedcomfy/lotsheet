import { describe, expect, it, vi } from "vitest";
import { buildSavedCatalog, browseCatalog, type CatalogSource } from "./catalog";
import { saveCatalog, readSavedCatalog } from "./catalog-store";
import { GET } from "../../api/fusion/catalog/route";
import { readCatalogNumbers } from "./parts-server";

const source: CatalogSource = {
  startedAt: 100, fetchedAt: 200,
  parts: [{ id: "part:303031", number: "001", description: "FILTER:ENGINE OIL", unit: null, unitCode: null, status: null },
    { id: "2", number: "002", description: "ANTIFREEZE:COOLANT", unit: null, unitCode: null, status: null }],
  locations: [{ key: "l", itemId: "1", partNumber: "001", subinventory: "Northwest", locator: "B-2" }],
  subinventories: [{ key: "s", itemId: "1", partNumber: "001", subinventory: "Northwest", locator: null }],
  reportLocations: [{ itemId: null, partNumber: "001", subinventory: "Northwest", locator: "B-2" }],
  references: [{ itemId: "1", partNumber: "001", unit: "Piece", numbers: [{ type: "MPN", value: "FS1065" }] }],
};
describe("Permanent NWD catalog", () => {
  it("preserves leading zeros, IDs, multiple locations and MPNs, without stock or credentials", () => {
    const catalog = buildSavedCatalog({ ...source, accessToken: "SECRET", balances: [{ quantity: 12 }], reportLocations: [{ ...source.reportLocations[0], quantity: 99 }] } as unknown as CatalogSource);
    expect(catalog.parts[0]).toMatchObject({ number: "001", itemIds: ["1"], name: "FILTER", unit: null, numbers: [{ type: "MPN", value: "FS1065" }], locations: [{ stockroom: "Northwest", locator: "B-2" }] });
    expect(JSON.stringify(catalog)).not.toMatch(/SECRET|quantity|accessToken|balances/);
    expect(browseCatalog(catalog.parts, "fs1065", "", "number")).toHaveLength(1);
    expect(browseCatalog(catalog.parts, "engine", "b-2", "number")).toHaveLength(1);
    expect(browseCatalog(catalog.parts, "", "__unassigned__", "number")[0].number).toBe("002");
    expect(browseCatalog(catalog.parts, "", "", "name")[0].number).toBe("002");
    expect(browseCatalog(catalog.parts, "", "", "number", true)[0].number).toBe("002");
  });
  it("keeps the latest complete snapshot and reads it without Oracle authentication", async () => {
    const latest = buildSavedCatalog({ ...source, startedAt: 1000, fetchedAt: Date.now() });
    await saveCatalog(latest); await saveCatalog(buildSavedCatalog(source));
    await saveCatalog(buildSavedCatalog({ ...source, fetchedAt: Date.now() + 10000 }));
    expect((await readSavedCatalog())?.fetchedAt).toBe(latest.fetchedAt);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    try {
      const response = await GET(new Request("https://nwmaint.app/api/fusion/catalog", { headers: { "X-Lotsheet-Fusion": "1", cookie: "__Secure-pace-fusion-access=expired" } }));
      expect(response.status).toBe(200); expect((await response.json()).catalog.parts).toHaveLength(2);
      expect(fetch).not.toHaveBeenCalled();
      expect((await GET(new Request("https://nwmaint.app/api/fusion/catalog"))).status).toBe(403);
    } finally { vi.unstubAllGlobals(); }
  });
  it("pages expanded manufacturer numbers and checks NWD scope", async () => {
    const token = "e30." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+1000 })).toString("base64url") + ".test";
    const row = { OrganizationId: 300000004581674, SubinventoryItemId: "1_2", InventoryItemId: 1, ItemNumber: "001", MinmaxQuantityUOMMeasure: "Piece",
      MPNs: { items: [{ MPN: "A" }], offset: 0, hasMore: true }, GTINs: { items: [{ GTIN: "000123" }], hasMore: false } };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [row], hasMore: false }))
      .mockResolvedValueOnce(Response.json({ items: [{ MPN: "B" }], offset: 1, hasMore: false }))
      .mockResolvedValueOnce(Response.json({ items: [{ ...row, OrganizationId: 9 }], hasMore: false }));
    vi.stubGlobal("fetch", fetch);
    try {
      expect((await readCatalogNumbers(token, 0)).items[0].numbers).toEqual([{ type: "MPN", value: "A" }, { type: "MPN", value: "B" }, { type: "GTIN", value: "000123" }]);
      expect(fetch.mock.calls[1][0]).toContain("/subinventoryItems/1_2/child/MPNs?");
      await expect(readCatalogNumbers(token, 0)).rejects.toMatchObject({ code: "FORMAT" });
    } finally { vi.unstubAllGlobals(); }
  });
});
