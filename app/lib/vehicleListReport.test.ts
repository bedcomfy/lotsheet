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
    expect(parsed.rows.map((r) => [r.bus, r.odometer])).toEqual([["6450", 429811], ["2779", 428434]]);
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
