import { afterEach, describe, expect, it, vi } from "vitest";
import { FusionClient, type FusionSnapshot } from "./client";
import { FUSION_ORIGIN, FUSION_PROTOCOL, FUSION_SESSION_PATH, parseFusionResult } from "./config";

const CHANNEL = "11111111-1111-4111-8111-111111111111";
function fixture(handoff = true, initialSaved = false) {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T07:00:00Z"));
  let saved = initialSaved, readStatus = 200;
  const expiresAt = Date.now() + 14400000;
  const result = { resource: "workOrders", items: [{ WorkOrderNumber: "NWD-1683", secret: "not-projected" }], offset: 0,
    hasMore: false, expiresAt, fetchedAt: Date.now() };
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const storage = new Map<string, string>();
  const peer = { closed: false, postMessage: vi.fn() };
  const url = new URL("https://nwmaint.app/fusion" + (handoff ? "#fusion=" + CHANNEL : ""));
  const fetch = vi.fn(async (path: string, options: RequestInit = {}) => {
    if (path === FUSION_SESSION_PATH) {
      if (options.method === "POST") saved = true;
      if (options.method === "DELETE") saved = false;
      return Response.json({ connected: saved && expiresAt > Date.now(), expiresAt: saved && expiresAt > Date.now() ? expiresAt : null });
    }
    return readStatus === 200 ? Response.json(result) : Response.json({ code: "AUTH", error: "never-display-raw-error" }, { status: readStatus });
  });
  const host = {
    opener: handoff ? peer : null, location: url, fetch,
    sessionStorage: { setItem: (k: string, v: string) => storage.set(k, v), getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => storage.delete(k) },
    history: { state: {}, replaceState: (_state: unknown, _unused: string, path: string) => { url.href = new URL(path, url).href; } },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => listeners.get(type)?.delete(fn),
    setTimeout, clearTimeout, setInterval, clearInterval,
  } as unknown as Window;
  const states: FusionSnapshot[] = [];
  const client = new FusionClient(host, state => states.push(state));
  client.start();
  const dispatch = (message: object, overrides: object = {}) => {
    for (const fn of [...listeners.get("message") ?? []]) fn({ origin: FUSION_ORIGIN, source: peer,
      data: { protocol: FUSION_PROTOCOL, channel: CHANNEL, ...message }, ...overrides });
  };
  return { client, host, storage, states, peer, dispatch, fetch, result, expiresAt, state: () => states.at(-1),
    focus: () => { for (const fn of [...listeners.get("focus") ?? []]) fn({}); },
    revoke: () => { readStatus = 401; } };
}
afterEach(() => vi.useRealTimers());

describe("saved Fusion access", () => {
  it("accepts only the exact Fusion opener and sends the token directly to the session endpoint", async () => {
    const f = fixture();
    const message = { type: "authorization", accessToken: "synthetic-token" };
    f.dispatch(message, { origin: "https://other.example" });
    f.dispatch(message, { source: {} });
    f.dispatch({ ...message, channel: "wrong" });
    expect(f.fetch).not.toHaveBeenCalled();
    f.dispatch(message);
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    expect(f.fetch.mock.calls[0]).toMatchObject([FUSION_SESSION_PATH, { method: "POST", credentials: "same-origin", cache: "no-store" }]);
    expect(f.storage.size).toBe(0);
    expect(JSON.stringify(f.states)).not.toContain("synthetic-token");
    expect(f.host.location.hash).toBe("");
    expect(f.peer.postMessage.mock.calls.at(-1)?.[0].type).toBe("complete");
    f.client.dispose();
  });

  it("continues to read after Fusion closes, and restores after the receiving page remounts", async () => {
    const f = fixture();
    f.dispatch({ type: "authorization", accessToken: "synthetic-token" });
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    f.peer.closed = true;
    await vi.advanceTimersByTimeAsync(6000);
    await f.client.read("workOrders", "NWD-1683");
    expect(f.state()?.result?.items[0].WorkOrderNumber).toBe("NWD-1683");
    expect(JSON.stringify(f.state())).not.toContain("not-projected");
    f.client.dispose();
    const restored = new FusionClient(f.host, state => f.states.push(state));
    restored.start();
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    expect(f.fetch.mock.calls.at(-1)?.[0]).toBe(FUSION_SESSION_PATH);
    expect(f.fetch.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(0);
    restored.dispose();
  });

  it("uses existing saved access without an opener or any browser storage credential", async () => {
    const f = fixture(false, true);
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    expect(f.state()?.expiresAt).toBe(f.expiresAt);
    expect(f.storage.size).toBe(0);
    await f.client.read("workOrders", "");
    const options = f.fetch.mock.calls.at(-1)?.[1];
    expect(options?.headers).not.toHaveProperty("Authorization");
    f.client.dispose();
  });

  it("clears displayed records and requires reauthentication at expiry", async () => {
    const f = fixture(false, true);
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    await f.client.read("workOrders", "");
    await vi.advanceTimersByTimeAsync(14400000);
    expect(f.state()).toMatchObject({ status: "sign-in-required", expiresAt: null, result: null, reading: false });
    const calls = f.fetch.mock.calls.length;
    await f.client.read("workOrders", "");
    expect(f.fetch).toHaveBeenCalledTimes(calls);
    f.client.dispose();
  });

  it("requires reauthentication if Oracle rejects access before its expiry", async () => {
    const f = fixture(false, true);
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    f.revoke();
    await f.client.read("workOrders", "");
    expect(f.state()).toMatchObject({ status: "sign-in-required", result: null, reading: false });
    expect(f.state()?.error).not.toContain("never-display");
    const calls = f.fetch.mock.calls.length;
    f.focus();
    expect(f.fetch).toHaveBeenCalledTimes(calls);
    expect(f.state()?.status).toBe("sign-in-required");
    f.client.dispose();
  });

  it("does not claim access is saved when the browser rejects its cookie", async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(Response.json({ connected: true, expiresAt: f.expiresAt }));
    f.dispatch({ type: "authorization", accessToken: "synthetic-token" });
    await vi.waitFor(() => expect(f.state()?.status).toBe("sign-in-required"));
    expect(f.state()?.error).toContain("could not be saved");
    expect(f.peer.postMessage.mock.calls.at(-1)?.[0].type).toBe("cancel");
    f.client.dispose();
  });

  it("Disconnect clears the server-managed session and local results", async () => {
    const f = fixture(false, true);
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    await f.client.read("workOrders", "");
    await f.client.disconnect();
    expect(f.fetch.mock.calls.at(-1)).toMatchObject([FUSION_SESSION_PATH, { method: "DELETE" }]);
    expect(f.state()).toMatchObject({ status: "disconnected", expiresAt: null, result: null, reading: false });
    f.client.dispose();
  });

  it("rejects query injection and malformed or oversized result data", async () => {
    const f = fixture(false, true);
    await vi.waitFor(() => expect(f.state()?.status).toBe("connected"));
    const calls = f.fetch.mock.calls.length;
    await f.client.read("workOrders", "x' OR 1=1");
    expect(f.fetch).toHaveBeenCalledTimes(calls);
    expect(parseFusionResult({ ...f.result, items: Array(26).fill({}) })).toBeNull();
    expect(parseFusionResult({ ...f.result, resource: "employees" })).toBeNull();
    expect(parseFusionResult({ ...f.result, items: [{ WorkOrderNumber: {} }] })).toBeNull();
    f.client.dispose();
  });
});
