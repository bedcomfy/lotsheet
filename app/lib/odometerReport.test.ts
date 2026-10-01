import { describe, expect, it } from "vitest";
import { odometerReportDate, parseOdometerLine, parseOdometerReport } from "./odometerReport";

describe("parseOdometerLine", () => {
  it("reads a serviced vehicle with and without a department", () => {
    expect(parseOdometerLine("002770 0043 424925.4 5.6 241.9 48.4 0.0 0.0 0.0")).toMatchObject({
      bus: "2770", division: "0043", dept: null, odometer: 424925, mpg: 5.6, milesRun: 241.9, notServiced: false,
    });
    expect(parseOdometerLine("006378 0043 MAIN 555509.7 3.8 240.0 56.8 0.0 0.0 0.0")).toMatchObject({
      bus: "6378", dept: "MAIN", odometer: 555510,
    });
  });

  it("flags the not-serviced star and keeps the odometer", () => {
    expect(parseOdometerLine("002771 0043 448601.9 * 5.4 * 0.0 0.0 0.0 0.0 0.0")).toMatchObject({
      bus: "2771", odometer: 448602, notServiced: true, milesRun: 0,
    });
    expect(parseOdometerLine("025546 0043 MAIN 2789.8 * 3.3 * 0.0 0.0 0.0 0.0 0.0")).toMatchObject({ bus: "25546", odometer: 2790 });
  });

  it("ignores headers, totals and footers", () => {
    expect(parseOdometerLine("Number Division Dept Last Trans Last Trans Run Fuel Oil Cool ATF")).toBeNull();
    expect(parseOdometerLine("4.5 21317.2 4664.9 244.7 79.1 11.0")).toBeNull();
    expect(parseOdometerLine("133 Vehicle(s) in Division 0043")).toBeNull();
    expect(parseOdometerLine("2779 3,012 -12 PM-A 15000 MILES 2119994 428,434 428,422")).toBeNull();
  });
});

describe("parseOdometerReport", () => {
  it("takes the period end as the reading date and dedupes by bus", () => {
    const line = (y: number, words: string[]) => words.map((text, i) => ({ text, x: 40 + i * 70, y, dirX: 1, dirY: 0 }));
    const items = [
      ...line(760, ["Report for Division 0043 and All Departments between 09/29/2026 04:55 AM and 09/30/2026 08:00 PM"]),
      ...line(700, ["002770", "0043", "424925.4", "5.6", "241.9", "48.4", "0.0", "0.0", "0.0"]),
      ...line(686, ["002770", "0043", "424000.0", "5.6", "241.9", "48.4", "0.0", "0.0", "0.0"]),
      ...line(672, ["006378", "0043", "MAIN", "555509.7", "3.8", "240.0", "56.8", "0.0", "0.0", "0.0"]),
    ];
    const parsed = parseOdometerReport([items]);
    expect(parsed.reportDate).toBe("9/30/26");
    expect(parsed.rows.map((r) => [r.bus, r.odometer])).toEqual([["2770", 424925], ["6378", 555510]]);
  });

  it("falls back to the footer date", () => {
    expect(odometerReportDate("Sep/30/2026 08:28:49 PM Page 3/3")).toBe("9/30/26");
    expect(odometerReportDate("Version 4.0.13 (GH)")).toBeNull();
  });
});
