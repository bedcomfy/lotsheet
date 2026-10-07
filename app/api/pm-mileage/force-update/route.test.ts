import { beforeEach, describe, expect, it, vi } from "vitest";
const sync = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/fleetwatchSync", () => ({ syncFleetwatchVehicleList: sync }));
import { ADMIN_COOKIE, adminToken } from "../../../lib/adminAuth";
import { POST } from "./route";

describe("Force Update", () => {
  beforeEach(() => { sync.mockReset(); sync.mockResolvedValue({ ok: true, status: { updated: 2, unchanged: 130 }, rows: 132 }); });
  it("needs Admin Tools", async () => {
    const response = await POST(new Request("http://localhost/api/pm-mileage/force-update", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });
  it("runs the Vehicle List update for an admin and reports the result", async () => {
    const response = await POST(new Request("http://localhost/api/pm-mileage/force-update", {
      method: "POST", headers: { cookie: `${ADMIN_COOKIE}=${adminToken()}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rows: 132, status: { updated: 2 } });
    expect(sync).toHaveBeenCalledOnce();
  });
  it("reports a source failure as 502 without hiding the message", async () => {
    sync.mockResolvedValue({ ok: false, error: "Fleetwatch returned an unexpected report. No mileage was changed." });
    const response = await POST(new Request("http://localhost/api/pm-mileage/force-update", {
      method: "POST", headers: { cookie: `${ADMIN_COOKIE}=${adminToken()}` },
    }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/unexpected report/);
  });
});
