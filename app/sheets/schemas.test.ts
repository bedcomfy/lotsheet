import { describe, expect, it } from "vitest";
import {
  fareboxSheetSchema,
  fuelSheetSchema,
  lotSheetSchema,
  turnoverSheetSchema,
} from "./schemas";

describe("existing SheetKit data schemas", () => {
  it("fills safe defaults for old Lot Sheet records", () => {
    const value = lotSheetSchema.parse({ cells: { a: "6401" }, lots: {} });
    expect(value).toMatchObject({
      cells: { a: "6401" },
      lots: {},
      locks: [],
      timeOverride: false,
      dateOverride: false,
    });
  });

  it("keeps old Turnover records readable", () => {
    expect(turnoverSheetSchema.parse({ cells: { foreman: "A" } })).toEqual({
      cells: { foreman: "A" },
      shift: "",
    });
  });

  it("validates Fuel and Farebox fixture shapes", () => {
    expect(fuelSheetSchema.parse({ entries: {} }).entries).toEqual({});
    expect(fareboxSheetSchema.parse({ entries: {} }).entries).toEqual({});
  });
});
