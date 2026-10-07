import { afterEach, describe, expect, it, vi } from "vitest";
import { fleetwatchVehicleListUrl } from "./fleetwatch";
import { syncFleetwatchVehicleList } from "./fleetwatchSync";

const DATELESS_URL = "https://pace.fleetwatch.com/Main_Reports/reports/Vehicle/Vehicle%20List%20Report/Report.php?Division=0043&Department=All&VehType=All&TotalBy=Division&Detail=Detail&Revenue=All&VehicleServiceStatus=All&reportFormat=pdf";

afterEach(() => vi.unstubAllGlobals());

describe("Force Update source", () => {
  it("is the dateless Vehicle List Report URL, exactly as supplied", () => {
    expect(fleetwatchVehicleListUrl().toString()).toBe(DATELESS_URL);
    expect(fleetwatchVehicleListUrl().searchParams.has("StartDate")).toBe(false);
    expect(fleetwatchVehicleListUrl().searchParams.has("EndDate")).toBe(false);
  });

  it("downloads that one report and never the dated mileage or service reports", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      fetched.push(input instanceof URL ? input.toString() : String(input));
      throw new Error("offline in this test");
    }));
    const result = await syncFleetwatchVehicleList();
    expect(result.ok).toBe(false);
    expect(fetched).toEqual([DATELESS_URL]);
  });
});
