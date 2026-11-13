import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createFusionBookmark } from "./bookmark";
import { FUSION_ORIGIN, FUSION_PROTOCOL } from "./config";

const APP = "https://nwmaint.app";
const CHANNEL = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;

function fixture(statuses: number[] = []) {
  let now = Date.UTC(2026, 10, 13, 6), issues = 0;
  const listeners = new Map<string, Set<(event: unknown) => Promise<void> | void>>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const peer = { closed: false, postMessage: vi.fn() };
  const window = {
    open: vi.fn(() => peer),
    addEventListener: (type: string, callback: (event: unknown) => Promise<void> | void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener: (type: string, callback: (event: unknown) => Promise<void> | void) => listeners.get(type)?.delete(callback),
    __lotsheetFusionConnection: undefined as { stop: () => void } | undefined,
  };
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    let status = 200;
    let body: object;
    if (path.endsWith("/anticsrf")) body = { xsrftoken: "private-csrf" };
    else if (path.endsWith("/tokenrelay")) {
      issues++;
      body = { access_token: "e30." + Buffer.from(JSON.stringify({ exp: now / 1000 + 14400 })).toString("base64url") + ".private-signature-" + issues };
    } else {
      status = statuses.shift() ?? 200;
      body = { items: [{ WorkOrderNumber: "NWD-1683", WorkOrderDescription: "Inspection", AssetNumber: "6396",
        WorkOrderStatus: "Released", privateDetails: "never-forward-this", Authorization: "never-forward-auth" }], hasMore: false };
      expect(options.credentials).toBe("omit");
    }
    return { status, ok: status === 200, json: async () => body };
  });
  const schedule = (callback: () => void) => { const n = ++timerId; timers.set(n, callback); return n; };
  runInNewContext(decodeURIComponent(createFusionBookmark(APP).slice("javascript:".length)), {
    location: { origin: FUSION_ORIGIN }, window, alert: vi.fn(), crypto: { randomUUID: () => CHANNEL },
    URLSearchParams, AbortController, atob, fetch,
    Date: class extends Date { static now() { return now; } },
    setInterval: schedule, setTimeout: schedule,
    clearInterval: (n: number) => timers.delete(n), clearTimeout: (n: number) => timers.delete(n),
  });
  const dispatch = async (message: Record<string, unknown>, overrides: Record<string, unknown> = {}) => {
    for (const listener of [...listeners.get("message") ?? []]) await listener({
      origin: APP, source: peer,
      data: { protocol: FUSION_PROTOCOL, channel: CHANNEL, ...message }, ...overrides,
    });
  };
  const read = (n: number, changes = {}) => dispatch({ type: "read", id: id(n), resource: "workOrders", search: "NWD-1683", offset: 0, ...changes });
  return { peer, window, fetch, timers, dispatch, read, advance: (ms: number) => { now += ms; }, issues: () => issues };
}

describe("Fusion favorite", () => {
  it("serializes a self-contained, read-only connection without sending credentials to Lotsheet", async () => {
    const f = fixture();
    expect(f.window.open).toHaveBeenCalledWith(APP + "/fusion#fusion=" + CHANNEL, "_blank");
    await f.dispatch({ type: "hello" });
    await f.read(1);
    expect(f.fetch).toHaveBeenCalledTimes(3);
    for (const [, options] of f.fetch.mock.calls) {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
      expect(options.cache).toBe("no-store");
    }
    expect(f.fetch.mock.calls[0][1].credentials).toBe("same-origin");
    expect(f.fetch.mock.calls[1][1].headers).toMatchObject({ "X-XSRF-TOKEN": "private-csrf" });
    expect(f.fetch.mock.calls[2][1].headers).toMatchObject({ Authorization: expect.stringContaining("Bearer ") });
    const query = new URL(f.fetch.mock.calls[2][0], FUSION_ORIGIN).searchParams;
    expect(query.get("q")).toBe("WorkOrderNumber='NWD-1683'");
    expect(query.get("limit")).toBe("25");
    const message = f.peer.postMessage.mock.calls.at(-1)!;
    expect(message[1]).toBe(APP);
    expect(message[0]).toMatchObject({ type: "result", result: { resource: "workOrders", items: [{ WorkOrderNumber: "NWD-1683" }] } });
    expect(JSON.stringify(f.peer.postMessage.mock.calls)).not.toMatch(/private-|never-forward|access_token|Authorization/);
  });

  it("rejects other origins, windows, channels, methods, arbitrary resources, and query injection", async () => {
    const f = fixture();
    await f.dispatch({ type: "hello" }, { origin: "https://elsewhere.example" });
    await f.read(1);
    expect(f.fetch).not.toHaveBeenCalled();
    await f.dispatch({ type: "hello" });
    const request = { type: "read", id: id(1), resource: "workOrders", search: "", offset: 0 };
    await f.dispatch(request, { source: {} });
    await f.dispatch(request, { origin: "https://elsewhere.example" });
    await f.dispatch({ ...request, channel: id(9) });
    await f.dispatch({ ...request, type: "POST" });
    await f.read(2, { resource: "../employees" });
    await f.read(3, { resource: "__proto__" });
    await f.read(4, { search: "x' OR 1=1" });
    await f.read(5, { offset: -1 });
    await f.read(6, { offset: 0.5 });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("reuses a valid token, renews it on the next read near expiry, and ignores replayed requests", async () => {
    const f = fixture();
    await f.dispatch({ type: "hello" });
    await f.read(1);
    await f.read(1);
    expect(f.fetch).toHaveBeenCalledTimes(3);
    await f.read(2);
    expect(f.fetch).toHaveBeenCalledTimes(4);
    expect(f.issues()).toBe(1);
    f.advance(4 * 3600000);
    await f.read(3);
    expect(f.fetch).toHaveBeenCalledTimes(7);
    expect(f.issues()).toBe(2);
  });

  it("replaces a rejected token once; repeated 401s require a new sign-in", async () => {
    const f = fixture([401, 401]);
    await f.dispatch({ type: "hello" });
    await f.read(1);
    expect(f.issues()).toBe(2);
    expect(f.fetch).toHaveBeenCalledTimes(6);
    expect(f.peer.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "error", code: "AUTH" });
  });

  it("does not retry a permission denial or forward its response body", async () => {
    const f = fixture([403]);
    await f.dispatch({ type: "hello" });
    await f.read(1);
    expect(f.issues()).toBe(1);
    expect(f.fetch).toHaveBeenCalledTimes(3);
    expect(f.peer.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "error", code: "FORBIDDEN" });
    expect(JSON.stringify(f.peer.postMessage.mock.calls)).not.toContain("never-forward");
  });

  it("disconnects, clears timers, and refuses further reads", async () => {
    const f = fixture();
    await f.dispatch({ type: "hello" });
    await f.read(1);
    await f.dispatch({ type: "disconnect" });
    await f.read(2);
    expect(f.fetch).toHaveBeenCalledTimes(3);
    expect(f.timers.size).toBe(0);
    expect(f.window.__lotsheetFusionConnection).toBeUndefined();
  });

  it("does not continue authentication after disconnect during an in-flight request", async () => {
    const f = fixture();
    await f.dispatch({ type: "hello" });
    let resolveResponse!: (response: { status: number; ok: boolean; json: () => Promise<object> }) => void;
    f.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveResponse = resolve; }));
    const reading = f.read(1);
    const signal = f.fetch.mock.calls[0][1].signal!;
    await f.dispatch({ type: "disconnect" });
    expect(signal.aborted).toBe(true);
    resolveResponse({ status: 200, ok: true, json: async () => ({ xsrftoken: "private-csrf" }) });
    await reading;
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.peer.postMessage.mock.calls.at(-1)![0].type).toBe("closed");
    expect(f.timers.size).toBe(0);
  });

  it("accepts only HTTPS destinations or local development addresses", () => {
    expect(() => createFusionBookmark("https://user:password@example.com")).toThrow();
    expect(() => createFusionBookmark("http://example.com")).toThrow();
    expect(createFusionBookmark("http://localhost:3002")).toMatch(/^javascript:/);
  });
});
