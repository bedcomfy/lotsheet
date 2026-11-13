import { afterEach, describe, expect, it, vi } from "vitest";
import { FusionClient, type FusionSnapshot } from "./client";
import { FUSION_ORIGIN, FUSION_PROTOCOL, parseFusionResult } from "./config";

const CHANNEL = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
const RESULT = { resource: "workOrders", items: [{ WorkOrderNumber: "NWD-1683" }], offset: 0, hasMore: false, expiresAt: 1794590000000, fetchedAt: 1794570000000 };

function fixture() {
  vi.useFakeTimers();
  const listeners = new Set<(event: MessageEvent) => void>();
  const storage = new Map<string, string>();
  const peer = { closed: false, postMessage: vi.fn() };
  const url = new URL("https://nwmaint.app/fusion#fusion=" + CHANNEL);
  const host = {
    opener: peer, location: url,
    sessionStorage: { setItem: (k: string, v: string) => storage.set(k, v), getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => storage.delete(k) },
    history: { state: {}, replaceState: (_state: unknown, _unused: string, path: string) => { url.href = new URL(path, url).href; } },
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.delete(fn),
    crypto: { randomUUID: () => REQUEST },
    setTimeout, clearTimeout, setInterval, clearInterval,
  } as unknown as Window;
  const states: FusionSnapshot[] = [];
  const client = new FusionClient(host, state => states.push(state));
  client.start();
  const dispatch = (message: object, overrides: object = {}) => {
    for (const fn of [...listeners]) fn({ origin: FUSION_ORIGIN, source: peer,
      data: { protocol: FUSION_PROTOCOL, channel: CHANNEL, ...message }, ...overrides } as unknown as MessageEvent);
  };
  return { client, host, storage, states, peer, dispatch, state: () => states.at(-1)! };
}
afterEach(() => vi.useRealTimers());

describe("Fusion receiving tab", () => {
  it("pairs only with the exact Fusion opener and channel", () => {
    const f = fixture();
    f.dispatch({ type: "ready" }, { origin: "https://other.example" });
    f.dispatch({ type: "ready" }, { source: {} });
    f.dispatch({ type: "ready", channel: REQUEST });
    expect(f.state().status).toBe("connecting");
    f.dispatch({ type: "ready" });
    expect(f.state().status).toBe("connected");
    f.client.dispose();
  });

  it("correlates reads and only retains selected display fields", () => {
    const f = fixture();
    f.dispatch({ type: "ready" });
    f.client.read("workOrders", "NWD-1683");
    f.dispatch({ type: "result", id: CHANNEL, result: RESULT });
    expect(f.state().reading).toBe(true);
    f.dispatch({ type: "result", id: REQUEST, result: { ...RESULT, access_token: "do-not-keep", items: [{ WorkOrderNumber: "NWD-1683", access_token: "do-not-keep" }] } });
    expect(f.state().result?.items[0].WorkOrderNumber).toBe("NWD-1683");
    expect(JSON.stringify(f.states)).not.toContain("do-not-keep");
    expect([...f.storage.values()]).toEqual([CHANNEL]);
    f.client.dispose();
  });

  it("clears data on disconnect and persists no business data or Oracle credentials", () => {
    const f = fixture();
    f.dispatch({ type: "ready" });
    f.client.read("workOrders", "");
    f.dispatch({ type: "result", id: REQUEST, result: RESULT });
    f.client.disconnect();
    expect(f.state()).toMatchObject({ status: "disconnected", result: null, reading: false });
    expect(f.storage.size).toBe(0);
    expect(f.peer.postMessage.mock.calls.at(-1)).toEqual([expect.objectContaining({ type: "disconnect" }), FUSION_ORIGIN]);
    f.client.dispose();
  });

  it("supports remounts and reloads without disconnecting the Fusion helper", () => {
    const f = fixture();
    f.dispatch({ type: "ready" });
    f.client.dispose();
    expect(f.host.location.hash).toBe("");
    const again = new FusionClient(f.host, state => f.states.push(state));
    again.start();
    f.dispatch({ type: "ready" });
    expect(f.state().status).toBe("connected");
    expect(f.peer.postMessage.mock.calls.filter(([message]) => message.type === "disconnect")).toHaveLength(0);
    again.dispose();
  });

  it("stops pending reads when the Fusion tab closes or its listener disappears", () => {
    const f = fixture();
    f.dispatch({ type: "ready" });
    f.client.read("workOrders", "");
    vi.advanceTimersByTime(60000);
    expect(f.state()).toMatchObject({ status: "disconnected", reading: false, result: null });
    f.client.dispose();
    const closed = fixture();
    closed.dispatch({ type: "ready" });
    closed.peer.closed = true;
    vi.advanceTimersByTime(5000);
    expect(closed.state().status).toBe("disconnected");
    closed.client.dispose();
  });

  it("requires sign-in after authentication fails and rejects invalid searches locally", () => {
    const f = fixture();
    f.dispatch({ type: "ready" });
    const count = f.peer.postMessage.mock.calls.length;
    f.client.read("workOrders", "x' OR 1=1");
    expect(f.peer.postMessage.mock.calls).toHaveLength(count);
    f.client.read("assets", "6396");
    f.dispatch({ type: "error", id: REQUEST, code: "AUTH", message: "do-not-display-raw-response" });
    expect(f.state().status).toBe("sign-in-required");
    expect(f.state().error).not.toContain("do-not-display");
    f.client.dispose();
  });

  it("rejects malformed, oversized, or unexpected data", () => {
    expect(parseFusionResult({ ...RESULT, items: Array(26).fill({}) })).toBeNull();
    expect(parseFusionResult({ ...RESULT, resource: "employees" })).toBeNull();
    expect(parseFusionResult({ ...RESULT, items: [{ WorkOrderNumber: {} }] })).toBeNull();
    expect(parseFusionResult({ ...RESULT, expiresAt: Infinity })).toBeNull();
  });
});
