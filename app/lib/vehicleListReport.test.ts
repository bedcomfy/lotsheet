import { describe, expect, it } from "vitest";
import type { PositionedText } from "./pmReport";
import { parseVehicleListReport } from "./vehicleListReport";

// Builds one positioned line: [text, x] pairs at a given y (upright text).
function line(y: number, cells: Array<[string, number]>): PositionedText[] {
  return cells.map(([text, x]) => ({ text, x, y, dirX: 1, dirY: 0 }));
}

describe("Vehicle List Report", () => {
  it("reads the vehicle and odometer columns the header names, ignoring years, VINs and totals", () => {
    const page: PositionedText[] = [
      ...line(760, [["Vehicle List Report", 250]]),
      ...line(745, [["Division: 0043", 40], ["Oct/07/2026 10:15:03 AM", 420]]),
      // Header words arrive as separate tokens.
      ...line(700, [["Vehicle", 40], ["Number", 75], ["Year", 130], ["Make", 170], ["Model", 230], ["VIN", 300], ["Odometer", 420], ["Status", 500]]),
      // Right-aligned numbers sit a little right of their headers.
      ...line(680, [["006450", 44], ["2015", 132], ["ENC", 172], ["Axess", 232], ["5FYD8FV05FB048101", 302], ["429,811", 436], ["Active", 502]]),
      ...line(660, [["002779", 44], ["2010", 132], ["ENC", 172], ["EZ-Rider II", 232], ["5FYD2FV00AB047011", 302], ["428434", 440], ["Active", 502]]),
      ...line(640, [["006450", 44], ["2015", 132], ["ENC", 172], ["Axess", 232], ["5FYD8FV05FB048101", 302], ["429,700", 436], ["Active", 502]]),
      ...line(620, [["Division Total", 40], ["3", 436]]),
    ];
    const parsed = parseVehicleListReport([page]);
    expect(parsed.columns).toEqual({ vehicle: "Vehicle Number", odometer: "Odometer" });
    expect(parsed.reportDate).toBe("10/7/26");
    expect(parsed.rows.map((r) => [r.bus, r.odometer, r.lastServiceAt])).toEqual([["6450", 429811, null], ["2779", 428434, null]]);
  });

  it("reads Fleetwatch's real layout: single-token header words, one-token service timestamps, and the long footer date", () => {
    // Token positions as the live Vehicle List Report lays them out.
    const header = line(700, [["Vehicle", 39], ["Department", 75], ["Fleet", 128], ["Region", 167], ["Card", 213], ["Type", 276], ["Description", 366], ["Odometer", 446], ["RF Equipped", 492], ["Tire Factor", 551], ["Primary Fuel", 605], ["Avg MPG", 660], ["Last Service", 705]]);
    const page: PositionedText[] = [
      ...line(760, [["Vehicle List Report", 250]]),
      ...header,
      ...line(680, [["002770", 40], ["0102", 128], ["Diesel Transit Bus", 244], ["2010 ElD EZII", 329], ["425481.5", 454], ["Yes", 505], ["100", 562], ["Diesel", 615], ["5.2", 669], ["10/06/2026 06:42:09 PM", 697]]),
      ...line(660, [["025546", 40], ["MAIN", 84], ["138", 130], ["Diesel Transit Bus", 244], ["Diesel Hybrid Bus", 329], ["2789.8", 461], ["Yes", 505], ["100", 562], ["Diesel", 615], ["3.3", 669], ["09/15/2026 03:06:23 AM", 697]]),
      ...line(640, [["043999", 40], ["MAIN", 84], ["Container", 244], ["Gas Cans, Lawn Mowers, etc.", 329], ["0.0", 471], ["No", 506], ["100", 562], ["Diesel", 615], ["10.0", 667], ["09/24/2026 07:54:03 AM", 697]]),
      ...line(620, [["139 Vehicles In Division 0043 - Northwest", 31]]),
      ...line(600, [["Tuesday, October 06, 2026 11:55:30 PM", 31], ["Page 5/5", 719]]),
    ];
    const parsed = parseVehicleListReport([page]);
    expect(parsed.columns).toEqual({ vehicle: "Vehicle", odometer: "Odometer", service: "Last Service" });
    expect(parsed.reportDate).toBe("10/6/26");
    expect(parsed.rows).toHaveLength(2); // the zero-odometer container is left out
    expect(parsed.rows[0]).toMatchObject({ bus: "2770", odometer: 425481.5, lastServiceAt: "2026-10-06T18:42:09", readAt: "10/6/26" });
    expect(parsed.rows[1]).toMatchObject({ bus: "25546", odometer: 2789.8, lastServiceAt: "2026-09-15T03:06:23", readAt: "9/15/26" });
  });

  it("reads nothing when the header cannot be found", () => {
    const page: PositionedText[] = [
      ...line(700, [["Bus", 40], ["Year", 130], ["Make", 170]]),
      ...line(680, [["6450", 44], ["2015", 132], ["ENC", 172], ["429,811", 436]]),
    ];
    const parsed = parseVehicleListReport([page]);
    expect(parsed.columns).toBeNull();
    expect(parsed.rows).toEqual([]);
  });

  it("follows a header that repeats on each page and accepts single-word headers", () => {
    const header = (y: number) => line(y, [["Unit", 40], ["Description", 120], ["Meter", 400]]);
    const page1 = [...header(700), ...line(680, [["2770", 42], ["40 ft low floor", 122], ["412,003", 412]])];
    const page2 = [...header(700), ...line(680, [["2771", 42], ["40 ft low floor", 122], ["398,120.0", 412]])];
    const parsed = parseVehicleListReport([page1, page2]);
    expect(parsed.rows.map((r) => [r.bus, r.odometer, r.page])).toEqual([["2770", 412003, 1], ["2771", 398120, 2]]);
  });
});
