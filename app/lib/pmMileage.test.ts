import { describe, expect, it } from "vitest";
import {
  DEFAULT_PM_SETTINGS,
  INSPECTION_CYCLE,
  TRANS_PM_INTERVAL,
  applyCompletion,
  emptyPmRecord,
  inspMilesRemaining,
  inspectionInterval,
  nextInspection,
  nextInspectionType,
  normalizePmSettings,
  normalizeReportBus,
  pmStatus,
  reviewReadings,
  sortPmRecords,
  toMiles,
  transMilesRemaining,
  transNextDue,
} from "./pmMileage";

const S = DEFAULT_PM_SETTINGS;

describe("inspection cycle", () => {
  it("steps through the cycle and wraps after C-24", () => {
    expect(INSPECTION_CYCLE).toEqual(["A-3", "B-6", "A-9", "B-12", "A-15", "B-18", "A-21", "C-24"]);
    expect(nextInspectionType("B-12")).toBe("A-15");
    expect(nextInspectionType("C-24")).toBe("A-3");
    expect(nextInspectionType(null)).toBeNull();
  });

  it("intervals come from the mile marks — 3,000 between each, including the wrap", () => {
    expect(inspectionInterval("B-12", "A-15")).toBe(3000);
    expect(inspectionInterval("A-3", "B-6")).toBe(3000);
    expect(inspectionInterval("C-24", "A-3")).toBe(3000);
  });

  it("derives the next inspection and miles left from the last one", () => {
    const r = { ...emptyPmRecord("6404"), odometer: 121_400, lastInspType: "B-12" as const, lastInspMiles: 120_000 };
    expect(nextInspection(r)).toEqual({ type: "A-15", miles: 123_000, interval: 3000 });
    expect(inspMilesRemaining(r)).toBe(1_600);
    expect(pmStatus(r, S)).toBe("ok");
  });

  it("is unknown without a last inspection type or mileage", () => {
    expect(nextInspection({ ...emptyPmRecord("1"), lastInspMiles: 10 })).toBeNull();
    expect(nextInspection({ ...emptyPmRecord("1"), lastInspType: "A-3" })).toBeNull();
    expect(pmStatus({ ...emptyPmRecord("1"), odometer: 10 }, S)).toBe("unknown");
  });
});

describe("transmission PM", () => {
  it("runs on a fixed 75,000-mile interval off the odometer", () => {
    const r = { ...emptyPmRecord("6435"), odometer: 190_000, lastTransMiles: 120_000 };
    expect(TRANS_PM_INTERVAL).toBe(75_000);
    expect(transNextDue(r)).toBe(195_000);
    expect(transMilesRemaining(r)).toBe(5_000);
  });

  it("the bus's status is whichever PM needs attention first", () => {
    const r = {
      ...emptyPmRecord("6435"),
      odometer: 195_300,
      lastInspType: "A-3" as const,
      lastInspMiles: 194_000, // next B-6 at 197,000 → 1,700 left → ok
      lastTransMiles: 120_000, // next at 195,000 → 300 over → overdue
    };
    expect(pmStatus(r, S)).toBe("overdue");
  });
});

describe("completing a PM", () => {
  it("moves the completed inspection to last and advances the next", () => {
    const r = { ...emptyPmRecord("6404"), odometer: 123_050, lastInspType: "B-12" as const, lastInspMiles: 120_000 };
    expect(pmStatus(r, S)).toBe("overdue");
    const done = applyCompletion(r, { kind: "inspection", miles: 123_050, date: "10/1/26" });
    expect(done.lastInspType).toBe("A-15");
    expect(done.lastInspMiles).toBe(123_050);
    expect(done.lastInspDate).toBe("10/1/26");
    expect(nextInspection(done)).toEqual({ type: "B-18", miles: 126_050, interval: 3000 });
    expect(pmStatus(done, S)).toBe("ok");
  });

  it("accepts an explicit type (first inspection on record) and bumps the odometer forward only", () => {
    const first = applyCompletion({ ...emptyPmRecord("2771"), odometer: 50_000 }, { kind: "inspection", type: "A-9", miles: 50_200, date: null });
    expect(first.lastInspType).toBe("A-9");
    expect(first.odometer).toBe(50_200);
    const older = applyCompletion({ ...emptyPmRecord("2771"), odometer: 50_000, odometerDate: "9/30/26" }, { kind: "inspection", type: "A-9", miles: 49_800, date: "9/1/26" });
    expect(older.odometer).toBe(50_000);
    expect(older.odometerDate).toBe("9/30/26");
    expect(() => applyCompletion(emptyPmRecord("2771"), { kind: "inspection", miles: 100, date: null })).toThrow(/Pick which inspection/);
  });

  it("completes a transmission PM without touching the inspection record", () => {
    const r = { ...emptyPmRecord("6435"), odometer: 195_300, lastInspType: "A-3" as const, lastInspMiles: 194_000, lastTransMiles: 120_000 };
    const done = applyCompletion(r, { kind: "trans", miles: 195_300, date: "10/1/26" });
    expect(done.lastTransMiles).toBe(195_300);
    expect(transNextDue(done)).toBe(270_300);
    expect(done.lastInspType).toBe("A-3");
    expect(pmStatus(done, S)).toBe("ok");
  });
});

describe("list order and parsing", () => {
  it("sorts overdue first, then due soon, then OK by miles left, then no record", () => {
    const rows = [
      { ...emptyPmRecord("6400"), odometer: 100, lastInspType: "A-3" as const, lastInspMiles: 0 }, // ok, 2900 left
      { ...emptyPmRecord("6401") }, // unknown
      { ...emptyPmRecord("6402"), odometer: 3100, lastInspType: "A-3" as const, lastInspMiles: 0 }, // overdue 100
      { ...emptyPmRecord("6403"), odometer: 2700, lastInspType: "A-3" as const, lastInspMiles: 0 }, // due soon 300
      { ...emptyPmRecord("6404"), odometer: 4000, lastInspType: "A-3" as const, lastInspMiles: 0 }, // overdue 1000
    ];
    expect(sortPmRecords(rows, S).map((r) => r.bus)).toEqual(["6404", "6402", "6403", "6400", "6401"]);
  });

  it("parses typed miles leniently and settings safely", () => {
    expect(toMiles("123,456")).toBe(123_456);
    expect(toMiles("123456.6")).toBe(123_457);
    expect(toMiles("")).toBeNull();
    expect(toMiles(-5)).toBeNull();
    expect(normalizePmSettings({ dueSoonMiles: "1,000" })).toEqual({ dueSoonMiles: 1000 });
    expect(normalizePmSettings(null)).toEqual(S);
  });
});

describe("report readings review", () => {
  const fleet = [
    { num: "6404", status: "active" },
    { num: "6435", status: "active" },
    { num: "2771", status: "retired" },
    { num: "9690", status: "active" },
  ];

  it("normalizes bus numbers the way reports print them", () => {
    const known = new Set(fleet.map((b) => b.num));
    expect(normalizeReportBus("Bus 6404", known)).toBe("6404");
    expect(normalizeReportBus("06435", known)).toBe("6435");
    expect(normalizeReportBus("PACE-9690", known)).toBe("9690");
    expect(normalizeReportBus("1234", known)).toBe("1234");
  });

  it("rejects unknown and retired buses, keeps the highest duplicate, flags regressions", () => {
    const current = {
      "6404": { ...emptyPmRecord("6404"), odometer: 121_400 },
      "6435": { ...emptyPmRecord("6435"), odometer: 90_000 },
    };
    const { accepted, rejected } = reviewReadings(
      [
        { bus: "6404", odometer: "121,900", readAt: "9/29/26" },
        { bus: "6404", odometer: 121_850 },
        { bus: "6435", odometer: 89_500 },
        { bus: "2771", odometer: 300_000 },
        { bus: "7777", odometer: 10 },
        { bus: "9690", odometer: 0 },
      ],
      fleet,
      current,
    );
    expect(accepted.map((r) => [r.bus, r.odometer, r.delta, r.warning])).toEqual([
      ["6404", 121_900, 500, null],
      ["6435", 89_500, -500, "Lower than the 90,000 on file"],
    ]);
    expect(rejected.map((r) => [r.bus, r.reason])).toEqual([
      ["2771", "Bus is retired"],
      ["7777", "Not in the fleet list"],
      ["9690", "No usable odometer reading"],
    ]);
  });
});
