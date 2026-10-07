import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("tracker download", () => {
  it("returns an .xlsx attachment named for today", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="PNW DAILY P\.M\. TRACKER \d{1,2}-\d{1,2}-\d{2}\.xlsx"$/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  }, 20_000);
});
