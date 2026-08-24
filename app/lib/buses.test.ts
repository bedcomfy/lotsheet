import { describe, expect, it } from "vitest";
import {
  DEFAULT_MASTER,
  busHelpers,
  csvToMaster,
  isOnHybridServiceLog,
  masterToCsv,
  normalizeBusMaster,
} from "./buses";
import type { MasterBus } from "./types";

const gillig: MasterBus = {
  num: "25538",
  model: "Gillig Low Floor Diesel Electric Hybrid",
  modelId: "gillig-low-floor-hev",
  status: "active",
  lane: true,
};

describe("hybrid service sheet membership", () => {
  it("migrates legacy Gillig hybrids off Fuel/DEF and onto the hybrid log", () => {
    const migrated = normalizeBusMaster({ buses: [gillig] }).buses[0];
    expect(migrated).toMatchObject({ lane: false, hybridLane: true });
    expect(isOnHybridServiceLog(migrated)).toBe(true);
  });

  it("respects an explicit administrator choice", () => {
    const explicit = { ...gillig, lane: true, hybridLane: false };
    const helpers = busHelpers({ buses: [explicit] });
    expect(helpers.laneBuses()).toEqual(["25538"]);
    expect(helpers.hybridServiceBuses()).toEqual([]);
    expect(helpers.fareboxBuses()).toEqual(["25538"]);
  });

  it("keeps dedicated hybrids on Farebox while removing them from Fuel/DEF", () => {
    const migrated = normalizeBusMaster({ buses: [gillig] });
    const helpers = busHelpers(migrated);
    expect(helpers.laneBuses()).toEqual([]);
    expect(helpers.hybridServiceBuses()).toEqual(["25538"]);
    expect(helpers.fareboxBuses()).toEqual(["25538"]);
  });

  it("round-trips both sheet membership columns through CSV", () => {
    const source = normalizeBusMaster({ buses: [gillig] }).buses;
    const csv = masterToCsv(source);
    expect(csv).toContain("Hybrid Service Log");
    expect(csvToMaster(csv).buses[0]).toMatchObject({
      lane: false,
      hybridLane: true,
    });
  });

  it("keeps every seeded Gillig hybrid on the weekly log and off Fuel/DEF", () => {
    const helpers = busHelpers(DEFAULT_MASTER);
    expect(helpers.hybridServiceBuses()).toEqual([
      "25538",
      "25539",
      "25540",
      "25541",
      "25542",
      "25543",
      "25544",
      "25545",
      "25546",
      "25547",
    ]);
    expect(
      helpers.laneBuses().filter((num) => num.startsWith("255")),
    ).toEqual([]);
  });
});
