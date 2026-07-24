import { describe, expect, it } from "vitest";
import { fleetStats } from "./fleetStats";
import type { FlagEntry, FlagMap, LotSheet, MasterBus } from "./types";

function entry(flags: string[]): FlagEntry {
  return { flags, note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
}

const master: MasterBus[] = [
  { num: "6001", status: "active" },
  { num: "6002", status: "active" },
  { num: "6003", status: "active" },
  { num: "6005", status: "active" },
  { num: "6004", status: "retired" },
  { num: "9690", status: "active", name: "JUDI" },
];

const sheet: LotSheet = {
  cells: { c1: "6001", c2: "9690" }, // on grid; JUDI is not a fleet bus
  lots: { north: ["6002"] }, // in a lot
};

const flags: FlagMap = {
  "6003": entry(["offprop"]), // off property
  "9690": entry(["offprop"]), // JUDI remains excluded
};

describe("fleetStats", () => {
  const stats = fleetStats(sheet, flags, master);

  it("counts a bus on the grid as ready for service", () => {
    expect([...stats.readyForService]).toEqual(["6001"]);
  });

  it("does not count off-property buses as out of service", () => {
    expect([...stats.notReadyForService]).toEqual(["6002"]);
  });

  it("tracks off-property buses", () => {
    expect([...stats.offProperty]).toEqual(["6003"]);
  });

  it("reports an active bus placed nowhere as missing (and ignores retired buses)", () => {
    expect(stats.missing).toEqual(["6005"]);
  });

  it("does not count a blocked (X) or empty cell as a bus", () => {
    const s: LotSheet = { cells: { c1: "X", c2: "" }, lots: {} };
    const st = fleetStats(s, {}, master);
    expect(st.onGrid.size).toBe(0);
  });

  it("excludes JUDI from every fleet total even when placed and flagged", () => {
    expect([...stats.activeFleet]).not.toContain("9690");
    expect([...stats.onGrid]).not.toContain("9690");
    expect([...stats.offProperty]).not.toContain("9690");
    expect(stats.missing).not.toContain("9690");
    expect(stats.accountedByFlagOnly).not.toContain("9690");
  });

  it("treats off property as mutually exclusive with grid, lot, and shop", () => {
    const s: LotSheet = {
      cells: { c1: "6003" },
      lots: { north: ["6003"], bay: ["6003"] },
    };
    const st = fleetStats(s, flags, master);
    expect([...st.offProperty]).toEqual(["6003"]);
    expect(st.onGrid.size).toBe(0);
    expect(st.inLots.size).toBe(0);
    expect(st.inShop.size).toBe(0);
    expect(st.readyForService.size).toBe(0);
    expect(st.notReadyForService.size).toBe(0);
  });
});
