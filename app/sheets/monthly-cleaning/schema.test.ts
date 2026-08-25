import { describe, expect, it } from "vitest";
import {
  cleaningMonthLabel,
  createBlankMonthlyCleaning,
  normalizeCleaningMonth,
} from "./schema";
import { buildMonthlyCleaningColumns } from "./MonthlyCleaningPaper";

describe("monthly bus cleaning sheet", () => {
  it("uses the current Chicago month for a new sheet", () => {
    expect(createBlankMonthlyCleaning(new Date("2026-09-01T03:00:00Z")).month)
      .toBe("2026-08");
  });

  it("formats and validates month values", () => {
    expect(normalizeCleaningMonth("2026-09")).toBe("2026-09");
    expect(normalizeCleaningMonth("2026-13")).toBe("");
    expect(cleaningMonthLabel("2026-09")).toBe("September 2026");
  });

  it("keeps room for the total while preserving every active bus", () => {
    const buses = Array.from({ length: 140 }, (_, index) => String(6000 + index));
    const result = buildMonthlyCleaningColumns(buses);
    expect(result.rows).toBe(36);
    expect(result.total).toBe(140);
    expect(result.columns.flat().filter(Boolean)).toHaveLength(140);
  });
});
