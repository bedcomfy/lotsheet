import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const dir = new URL("./fixtures/live/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name + ".json", dir), "utf8"));
describe("Captured Oracle development contracts", () => {
  it("contains credential-free real responses with explicit pagination metadata", () => {
    const manifest = read("manifest");
    expect(manifest.length).toBeGreaterThan(40);
    for (const entry of manifest.filter((m: { status: number }) => m.status === 200)) {
      const body = read(entry.name), serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
      expect(serialized).not.toMatch(/"(?:access_token|refresh_token|authorization|cookie|password)"\s*:/i);
      if (Array.isArray(body.items)) { expect(body.hasMore).toBeTypeOf("boolean"); expect(body.count).toBe(body.items.length); }
    }
  });
  it("retains the join keys, resource names, quantities and nullable fields needed by pages", () => {
    expect(read("asset-6403").items[0]).toMatchObject({ AssetNumber: "6403", OperatingOrganizationId: 300000004581674 });
    expect(read("work-orders").items.map((r: { WorkOrderNumber: string }) => r.WorkOrderNumber)).toContain("NWD-1670");
    expect(read("operation-1-WorkOrderOperationResource").items[0]).toMatchObject({ WorkOrderId: 300000023544158, OperationSequenceNumber: 30, ResourceType: "LABOR", ResourceCode: "Mechanic" });
    expect(read("resource-history").items.some((r: { ResourceInstance: string }) => r.ResourceInstance === "Selvin A Zambrano")).toBe(true);
    expect(read("material-history").items[0]).toMatchObject({ ComponentItemId: 100000024478060, TransactionType: "MATERIAL_ISSUE" });
    expect(read("asset-partsListComponents").hasMore).toBe(true);
  });
});
