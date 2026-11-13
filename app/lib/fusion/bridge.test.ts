import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createFusionBookmark } from "./bookmark";
import { FUSION_ORIGIN, FUSION_PROTOCOL } from "./config";

const APP = "https://nwmaint.app";
const CHANNEL = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const peer = { closed: false, postMessage: vi.fn() };
  const window = {
    open: vi.fn(() => peer),
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => listeners.get(type)?.delete(fn),
    __lotsheetFusionConnection: undefined as { stop: () => void } | undefined,
  };
  const fetch = vi.fn(async (path: string, _options: RequestInit) => ({ ok: true,
    json: async () => path.endsWith("/anticsrf") ? { xsrftoken: "private-csrf" } : { access_token: "synthetic-bearer" },
  }));
  const schedule = (fn: () => void) => { const id = ++timerId; timers.set(id, fn); return id; };
  runInNewContext(decodeURIComponent(createFusionBookmark(APP).slice("javascript:".length)), {
    location: { origin: FUSION_ORIGIN }, window, alert: vi.fn(), crypto: { randomUUID: () => CHANNEL },
    AbortController, fetch, setInterval: schedule, setTimeout: schedule,
    clearInterval: (id: number) => timers.delete(id), clearTimeout: (id: number) => timers.delete(id),
  });
  const dispatch = (data: object, overrides: object = {}) => {
    for (const fn of [...listeners.get("message") ?? []]) fn({ origin: APP, source: peer,
      data: { protocol: FUSION_PROTOCOL, channel: CHANNEL, ...data }, ...overrides });
  };
  return { peer, window, fetch, timers, dispatch };
}

describe("one-time Fusion favorite", () => {
  it("hands access only to the paired Lotsheet window and stops after receipt", async () => {
    const f = fixture();
    expect(f.window.open).toHaveBeenCalledWith(APP + "/fusion#fusion=" + CHANNEL, "_blank");
    expect(f.fetch).not.toHaveBeenCalled();
    f.dispatch({ type: "hello" });
    await vi.waitFor(() => expect(f.peer.postMessage).toHaveBeenCalled());
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect(f.fetch.mock.calls[1][1]).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error",
      headers: { "X-XSRF-TOKEN": "private-csrf" } });
    expect(f.peer.postMessage.mock.calls[0]).toEqual([
      { protocol: FUSION_PROTOCOL, channel: CHANNEL, type: "authorization", accessToken: "synthetic-bearer" }, APP,
    ]);
    expect(JSON.stringify(f.peer.postMessage.mock.calls)).not.toContain("private-csrf");
    f.dispatch({ type: "complete" });
    expect(f.window.__lotsheetFusionConnection).toBeUndefined();
    expect(f.timers.size).toBe(0);
    f.dispatch({ type: "hello" });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects unrelated origins, windows, channels, and read/mutation commands", () => {
    const f = fixture();
    f.dispatch({ type: "hello" }, { origin: "https://elsewhere.example" });
    f.dispatch({ type: "hello" }, { source: {} });
    f.dispatch({ type: "hello", channel: "wrong" });
    f.dispatch({ type: "read", resource: "assets" });
    f.dispatch({ type: "POST" });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.peer.postMessage).not.toHaveBeenCalled();
  });

  it("repeats only the handoff when the receiver reloads before acknowledging", async () => {
    const f = fixture();
    f.dispatch({ type: "hello" });
    await vi.waitFor(() => expect(f.peer.postMessage).toHaveBeenCalledTimes(1));
    f.dispatch({ type: "hello" });
    expect(f.peer.postMessage).toHaveBeenCalledTimes(2);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    f.dispatch({ type: "cancel" });
    expect(f.timers.size).toBe(0);
  });

  it("does not send a credential after cancellation during an in-flight request", async () => {
    const f = fixture();
    let finish!: (response: { ok: boolean; json: () => Promise<{ xsrftoken: string }> }) => void;
    f.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.dispatch({ type: "hello" });
    const signal = f.fetch.mock.calls[0][1].signal!;
    f.dispatch({ type: "cancel" });
    expect(signal.aborted).toBe(true);
    finish({ ok: true, json: async () => ({ xsrftoken: "private-csrf" }) });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.peer.postMessage).not.toHaveBeenCalled();
    expect(f.timers.size).toBe(0);
  });

  it("accepts only HTTPS destinations or local development addresses", () => {
    expect(() => createFusionBookmark("https://user:password@example.com")).toThrow();
    expect(() => createFusionBookmark("http://example.com")).toThrow();
    expect(createFusionBookmark("http://localhost:3002")).toMatch(/^javascript:/);
  });
});
