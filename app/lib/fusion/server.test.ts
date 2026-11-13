import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET as sessionGET, POST } from "../../api/fusion/session/route";
import { GET as recordsGET } from "../../api/fusion/records/route";
import { FUSION_COOKIE, FUSION_COOKIE_PATH, tokenExpiry } from "./server";
import { FUSION_ORIGIN, FUSION_REQUEST_HEADER } from "./config";

const APP = "https://nwmaint.app";
const jwt = (seconds = 14400, signature = "synthetic") => "e30." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url") + "." + signature;
const fakeFetch = vi.fn();
const records = { items: [{ WorkOrderNumber: "NWD-1683", WorkOrderDescription: "Inspection", WorkOrderStatus: "Released",
  AssetNumber: "6396", privateField: "never-return-this" }], hasMore: false };

function request(path = "/session", options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new Request(APP + "/api/fusion" + path, {
    method: options.method ?? "GET", headers: {
      [FUSION_REQUEST_HEADER]: "1", Origin: APP, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json",
      ...(options.token ? { Cookie: FUSION_COOKIE + "=" + options.token } : {}), ...options.headers,
    }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T07:00:00Z"));
  fakeFetch.mockReset().mockImplementation(async () => Response.json(records));
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("private Fusion sessions and reads", () => {
  it("checks the bearer with Oracle, then saves a scoped HttpOnly cookie until its actual expiry", async () => {
    const token = jwt();
    const response = await POST(request("/session", { method: "POST", body: { accessToken: token } }));
    expect(response.status).toBe(200);
    expect(response.cookies.get(FUSION_COOKIE)).toMatchObject({ value: token, httpOnly: true, secure: true,
      sameSite: "strict", path: FUSION_COOKIE_PATH, maxAge: 14400 });
    expect(response.cookies.get(FUSION_COOKIE)?.domain).toBeUndefined();
    expect(await response.json()).toEqual({ connected: true, expiresAt: Date.now() + 14400000 });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const [url, options] = fakeFetch.mock.calls[0];
    expect(new URL(url).origin).toBe(FUSION_ORIGIN);
    expect(new URL(url).searchParams.get("limit")).toBe("1");
    expect(options).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error",
      headers: { Authorization: "Bearer " + token } });
    expect(options.headers.Cookie).toBeUndefined();
  });

  it("restores only cookie metadata and keeps separate browsers unauthenticated", async () => {
    const token = jwt();
    const restored = sessionGET(request("/session", { token }));
    expect(await restored.json()).toEqual({ connected: true, expiresAt: tokenExpiry(token) });
    expect(await sessionGET(request()).json()).toEqual({ connected: false, expiresAt: null });
    expect(fakeFetch).not.toHaveBeenCalled();
    const missing = await recordsGET(request("/records?resource=workOrders", { headers: { Authorization: "Bearer " + token } }));
    expect(missing.status).toBe(401);
  });

  it("reads without a Fusion browser, bounds results, and projects only the selected fields", async () => {
    const token = jwt();
    fakeFetch.mockResolvedValueOnce(Response.json({ ...records, items: Array(30).fill(records.items[0]) }));
    const response = await recordsGET(request("/records?resource=workOrders&search=NWD-1683&offset=25", { token }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items).toHaveLength(25);
    expect(result.offset).toBe(25);
    expect(result.items[0].WorkOrderNumber).toBe("NWD-1683");
    expect(JSON.stringify(result)).not.toMatch(/synthetic|never-return|accessToken/);
    const query = new URL(fakeFetch.mock.calls[0][0]).searchParams;
    expect(query.get("q")).toBe("WorkOrderNumber='NWD-1683'");
    expect(query.get("limit")).toBe("25");
    expect(query.get("fields")).toContain("WorkOrderDescription");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("never accepts a decoded JWT as proof that Oracle will accept its signature", async () => {
    const token = jwt(14400, "forged");
    fakeFetch.mockResolvedValueOnce(Response.json({ detail: token }, { status: 401 }));
    const response = await POST(request("/session", { method: "POST", body: { accessToken: token } }));
    expect(response.status).toBe(401);
    expect(response.cookies.get(FUSION_COOKIE)).toBeUndefined();
    expect(await response.text()).not.toContain(token);
  });

  it("stops expired, malformed, or oversized credentials before any Oracle call", async () => {
    for (const token of [jwt(-1), "not-a-jwt", "x".repeat(3501), jwt(90000)]) {
      expect(tokenExpiry(token)).toBeNull();
      expect((await recordsGET(request("/records?resource=assets", { token }))).status).toBe(401);
    }
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests and non-JSON token submissions", async () => {
    const rejectedHeaders: Record<string, string>[] = [
      { Origin: "https://elsewhere.example" }, { "Sec-Fetch-Site": "cross-site" },
      { [FUSION_REQUEST_HEADER]: "" }, { Origin: "" },
    ];
    for (const headers of rejectedHeaders) {
      const response = await POST(request("/session", { method: "POST", body: { accessToken: jwt() }, headers }));
      expect(response.status).toBe(403);
    }
    expect((await POST(request("/session", { method: "POST", body: {}, headers: { "Content-Type": "text/plain" } }))).status).toBe(400);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects arbitrary URLs, resources, query expressions, duplicate parameters and unbounded paging", async () => {
    for (const query of ["resource=employees", "resource=__proto__", "resource=workOrders&url=https://elsewhere.example",
      "resource=workOrders&search=x%27%20OR%201=1", "resource=assets&offset=10001", "resource=assets&offset=-1",
      "resource=assets&offset=1.5", "resource=assets&resource=workOrders"]) {
      expect((await recordsGET(request("/records?" + query, { token: jwt() }))).status).toBe(400);
    }
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("can validate an assets-only account without expanding the allowlist", async () => {
    fakeFetch.mockResolvedValueOnce(Response.json({}, { status: 403 }));
    const response = await POST(request("/session", { method: "POST", body: { accessToken: jwt() } }));
    expect(response.status).toBe(200);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(new URL(fakeFetch.mock.calls[1][0]).pathname).toMatch(/installedBaseAssets$/);
  });

  it("returns controlled errors without logging or returning upstream secrets", async () => {
    for (const status of [401, 403, 302, 500]) {
      fakeFetch.mockResolvedValueOnce(Response.json({ secret: "do-not-return-credential" }, { status }));
      const response = await recordsGET(request("/records?resource=workOrders", { token: jwt() }));
      expect(response.status).toBe(status < 500 && status !== 302 ? status : 502);
      expect(await response.text()).not.toContain("do-not-return");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("Disconnect removes this browser's cookie without contacting or writing to Oracle", () => {
    const response = DELETE(request("/session", { method: "DELETE", token: jwt() }));
    expect(response.cookies.get(FUSION_COOKIE)).toMatchObject({ value: "", httpOnly: true, path: FUSION_COOKIE_PATH, maxAge: 0 });
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
