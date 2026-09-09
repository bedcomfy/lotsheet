import { describe, expect, it } from "vitest";
import { chicagoServiceDateShort, isStaleServiceDate } from "./chicagoTime";

// 2026-09-09 02:30 Chicago (CDT, UTC-5) — a night crew still on the 8th's shift.
const twoThirtyAm = new Date("2026-09-09T07:30:00Z");
// 2026-09-09 19:00 Chicago — the next evening's crew.
const sevenPm = new Date("2026-09-10T00:00:00Z");

describe("service day", () => {
  it("rolls over at 6 AM, not midnight", () => {
    expect(chicagoServiceDateShort(twoThirtyAm)).toBe("09/08/26");
    expect(chicagoServiceDateShort(sevenPm)).toBe("09/09/26");
  });

  it("keeps last night's date while that shift is still running", () => {
    expect(isStaleServiceDate("9/8/26", twoThirtyAm)).toBe(false);
  });

  it("flags yesterday's date once the next service day has started", () => {
    expect(isStaleServiceDate("9/8/26", sevenPm)).toBe(true);
    expect(isStaleServiceDate("09/08/2026", sevenPm)).toBe(true);
  });

  it("leaves today's, future, blank, and unparseable dates alone", () => {
    expect(isStaleServiceDate("9/9/26", sevenPm)).toBe(false);
    expect(isStaleServiceDate("9/10/26", sevenPm)).toBe(false);
    expect(isStaleServiceDate("", sevenPm)).toBe(false);
    expect(isStaleServiceDate("Tuesday", sevenPm)).toBe(false);
  });
});
