import { beforeEach, describe, expect, it, vi } from "vitest";
const sync = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/fleetwatchSync", () => ({ syncFleetwatchVehicleList: sync }));
import { POST } from "./route";

describe("Force Update", () => {
  beforeEach(() => { sync.mockReset(); sync.mockResolvedValue({ ok: true, status: { updated: 2, unchanged: 130 }, rows: 132 }); });
  it("runs the Vehicle List update for the crew, no Admin Tools needed", async () => {
    const response = await POST(new Request("https://nwmaint.app/api/pm-mileage/force-update", {
      method: "POST", headers: { host: "nwmaint.app", origin: "https://nwmaint.app", "sec-fetch-site": "same-origin" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rows: 132, status: { updated: 2 } });
    expect(sync).toHaveBeenCalledOnce();
  });
  it("rejects a request from another site", async () => {
    const response = await POST(new Request("https://nwmaint.app/api/pm-mileage/force-update", {
      method: "POST", headers: { host: "nwmaint.app", origin: "https://example.com", "sec-fetch-site": "cross-site" },
    }));
    expect(response.status).toBe(403);
    expect(sync).not.toHaveBeenCalled();
  });
  it("reports a source failure as 502 without hiding the message", async () => {
    sync.mockResolvedValue({ ok: false, error: "Fleetwatch returned an unexpected report. No mileage was changed." });
    const response = await POST(new Request("https://nwmaint.app/api/pm-mileage/force-update", {
      method: "POST", headers: { host: "nwmaint.app", origin: "https://nwmaint.app" },
    }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/unexpected report/);
  });
});
