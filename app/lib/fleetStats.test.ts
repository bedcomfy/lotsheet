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
];

const sheet: LotSheet = {
  cells: { c1: "6001" }, // on grid
  lots: { north: ["6002"] }, // in a lot
};

const flags: FlagMap = { "6003": entry(["offprop"]) }; // off property

describe("fleetStats", () => {
  const stats = fleetStats(sheet, flags, master);

  it("counts a bus on the grid as ready for service", () => {
    expect([...stats.readyForService]).toEqual(["6001"]);
  });

  it("counts lot + off-property buses as not ready for service", () => {
    expect([...stats.notReadyForService].sort()).toEqual(["6002", "6003"]);
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
});
