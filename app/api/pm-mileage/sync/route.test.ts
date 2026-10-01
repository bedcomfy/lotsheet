import { beforeEach, describe, expect, it, vi } from "vitest";
const sync = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/fleetwatchSync", () => ({ syncFleetwatchMileage: sync }));
import { POST } from "./route";

describe("manual and scheduled mileage requests", () => {
  beforeEach(() => { sync.mockReset(); sync.mockResolvedValue({ ok: true, status: { updated: 1 } }); });
  it("accepts the browser's public host behind a Next proxy", async () => {
    const response = await POST(new Request("http://localhost:3010/api/pm-mileage/sync", {
      method: "POST", headers: { host: "127.0.0.1:3010", origin: "http://127.0.0.1:3010", "sec-fetch-site": "same-origin" },
    }));
    expect(response.status).toBe(200);
    expect(sync).toHaveBeenCalledOnce();
  });
  it("accepts the background scheduler and reports source failures", async () => {
    sync.mockResolvedValue({ ok: false, error: "Fleetwatch unavailable" });
    const response = await POST(new Request("https://nwmaint.app/api/pm-mileage/sync", { method: "POST" }));
    expect(response.status).toBe(502);
  });
  it("rejects cross-site browser requests", async () => {
    const response = await POST(new Request("https://nwmaint.app/api/pm-mileage/sync", {
      method: "POST", headers: { origin: "https://example.com", "sec-fetch-site": "cross-site" },
    }));
    expect(response.status).toBe(403);
    expect(sync).not.toHaveBeenCalled();
  });
});
