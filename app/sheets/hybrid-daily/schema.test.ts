import { describe, expect, it } from "vitest";
import {
  currentHybridDailyDate,
  hybridDailyDayLabel,
} from "./schema";

describe("daily hybrid service dates", () => {
  it("labels the selected day", () => {
    expect(hybridDailyDayLabel("08/24/2026")).toBe("MONDAY");
    expect(hybridDailyDayLabel("12/31/2026")).toBe("THURSDAY");
  });

  it("uses the Chicago calendar date", () => {
    expect(currentHybridDailyDate(new Date("2026-08-24T05:30:00Z"))).toBe(
      "08/24/2026",
    );
  });
});
