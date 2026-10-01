import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import proxy from "../../proxy";
import { GATE_COOKIE, gateToken } from "./siteGate";

function request(path: string, init?: { method?: string; cookie?: string }) {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method || "GET",
    headers: init?.cookie ? { cookie: init.cookie } : undefined,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("site gate proxy", () => {
  it("serves the decoy page for every page path without the cookie", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    for (const path of ["/", "/home", "/pm-mileage", "/workorder?print=1", "/admin"]) {
      const res = await proxy(request(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const html = await res.text();
      expect(html).toContain("Typing Speed Test");
      expect(html).not.toMatch(/\bpace\b|garage|fleet|maintenance|\bbus\b|lot sheet|work order|turnover/i);
      expect(html).not.toContain("/_next/");
    }
  });

  it("answers 404 for APIs, Next internals, and files without the cookie", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    for (const path of ["/api/pm-mileage", "/api/state/lot", "/logo.png", "/pace-logo.png", "/manifest.webmanifest", "/_next/image?url=%2Flogo.png&w=64&q=75", "/favicon.ico"]) {
      const res = await proxy(request(path));
      expect(res.status, path).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("lets the unlock route and the Fleetwatch sync through", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    for (const path of ["/api/typing/results", "/api/pm-mileage/sync"]) {
      const res = await proxy(request(path, { method: "POST" }));
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("passes requests that carry a valid cookie and rejects a stale one", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    const token = await gateToken();
    const res = await proxy(request("/pm-mileage", { cookie: `${GATE_COOKIE}=${token}` }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    const api = await proxy(request("/api/pm-mileage", { cookie: `${GATE_COOKIE}=${token}` }));
    expect(api.headers.get("x-middleware-next")).toBe("1");

    vi.stubEnv("SITE_GATE_PASSPHRASE", "rotated phrase");
    const stale = await proxy(request("/pm-mileage", { cookie: `${GATE_COOKIE}=${token}` }));
    expect(stale.status).toBe(200);
    expect(await stale.text()).toContain("Typing Speed Test");
  });
});
