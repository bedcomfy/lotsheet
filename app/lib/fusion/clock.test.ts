import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAccessRemaining, fusionNow, remainingAccessSeconds, synchronizeFusionClock } from "./clock";

afterEach(() => { synchronizeFusionClock(null); vi.useRealTimers(); });
describe("Oracle access countdown", () => {
  it("uses the server expiry with clock calibration and catches up after skipped ticks", () => {
    vi.useFakeTimers(); vi.setSystemTime(1794710000000);
    const server = Date.now() - 300000;
    synchronizeFusionClock(String(server));
    const expiresAt = server + 3661000;
    expect(fusionNow()).toBe(server);
    expect(formatAccessRemaining(remainingAccessSeconds(expiresAt))).toBe("01:01:01");
    // Simulate a suspended/background tab without running any UI ticks.
    vi.setSystemTime(Date.now() + 61000);
    expect(formatAccessRemaining(remainingAccessSeconds(expiresAt))).toBe("01:00:00");
    vi.setSystemTime(Date.now() + 3600001);
    expect(remainingAccessSeconds(expiresAt)).toBe(0);
  });
  it("updates for replacement expiries and never displays negative time", () => {
    const now = 1794710000000;
    expect(remainingAccessSeconds(now + 999, now)).toBe(1);
    expect(remainingAccessSeconds(now, now)).toBe(0);
    expect(remainingAccessSeconds(now - 60000, now)).toBe(0);
    expect(remainingAccessSeconds(now + 7200000, now)).toBe(7200);
    expect(formatAccessRemaining(90061)).toBe("25:01:01");
  });
});
