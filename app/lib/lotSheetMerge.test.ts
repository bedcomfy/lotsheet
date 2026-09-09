import { describe, expect, it } from "vitest";
import { mergeLotSheet } from "./lotSheetMerge";
import type { LotSheet } from "./types";

const base = (): LotSheet => ({
  time: "8:00 PM",
  date: "9/8/26",
  offProperty: "",
  inShop: "",
  timeOverride: false,
  dateOverride: false,
  cells: { s1: "6414", s2: "6392" },
  lots: { north: ["6450"], east: [], fence: [], bay: ["", "", ""] },
  locks: [],
});

describe("mergeLotSheet", () => {
  it("keeps a concurrent server edit to a cell this client did not touch", () => {
    const local = { ...base(), cells: { ...base().cells, s3: "6461" } };
    const server = { ...base(), cells: { ...base().cells, s2: "6499" } };
    const merged = mergeLotSheet(base(), local, server);
    expect(merged.cells).toEqual({ s1: "6414", s2: "6499", s3: "6461" });
  });

  it("applies a local clear even when the server still has the old value", () => {
    const local = { ...base(), cells: { s1: "6414" } };
    const merged = mergeLotSheet(base(), local, base());
    expect(merged.cells).toEqual({ s1: "6414" });
  });

  it("replaces a lot list only when this client changed it", () => {
    const local = { ...base(), lots: { ...base().lots, north: ["6450", "6470"] } };
    const server = { ...base(), lots: { ...base().lots, east: ["6480"] } };
    const merged = mergeLotSheet(base(), local, server);
    expect(merged.lots.north).toEqual(["6450", "6470"]);
    expect(merged.lots.east).toEqual(["6480"]);
  });

  it("takes the server's header fields unless they were edited locally", () => {
    const local = { ...base(), time: "9:15 PM", timeOverride: true };
    const server = { ...base(), date: "9/9/26", inShop: "6" };
    const merged = mergeLotSheet(base(), local, server);
    expect(merged.time).toBe("9:15 PM");
    expect(merged.timeOverride).toBe(true);
    expect(merged.date).toBe("9/9/26");
    expect(merged.inShop).toBe("6");
  });

  it("falls back to the local sheet when there is no server copy yet", () => {
    const local = base();
    expect(mergeLotSheet(null, local, null)).toEqual(local);
  });
});
