import { describe, expect, it } from "vitest";
import {
  currentHybridWeekStart,
  hybridWeekDates,
  normalizeHybridWeekStart,
} from "./schema";

describe("weekly hybrid service dates", () => {
  it("normalizes any selected date to its Sunday", () => {
    expect(normalizeHybridWeekStart("08/24/2026")).toBe("08/23/2026");
    expect(normalizeHybridWeekStart("08/29/2026")).toBe("08/23/2026");
    expect(normalizeHybridWeekStart("08/23/2026")).toBe("08/23/2026");
  });

  it("derives all seven dates across month and year boundaries", () => {
    expect(hybridWeekDates("12/27/2026")).toEqual([
      "12/27/2026",
      "12/28/2026",
      "12/29/2026",
      "12/30/2026",
      "12/31/2026",
      "1/1/2027",
      "1/2/2027",
    ]);
  });

  it("uses the Chicago calendar date when selecting the current week", () => {
    expect(currentHybridWeekStart(new Date("2026-08-24T05:30:00Z"))).toBe(
      "08/23/2026",
    );
  });
});
