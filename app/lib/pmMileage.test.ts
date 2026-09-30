import { describe, expect, it } from "vitest";
import {
  DEFAULT_PM_SETTINGS,
  emptyPmRecord,
  milesRemaining,
  nextPmDue,
  normalizePmSettings,
  normalizeReportBus,
  pmStatus,
  reviewReadings,
  sortPmRecords,
  toMiles,
} from "./pmMileage";

const S = DEFAULT_PM_SETTINGS;

describe("PM mileage math", () => {
  it("derives next due and miles left from the last PM and the interval", () => {
    const r = { ...emptyPmRecord("6404"), odometer: 121_400, lastPmMiles: 118_000 };
    expect(nextPmDue(r, S)).toBe(124_000);
    expect(milesRemaining(r, S)).toBe(2_600);
    expect(pmStatus(r, S)).toBe("ok");
  });

  it("uses a per-bus interval when set", () => {
    const r = { ...emptyPmRecord("2771"), odometer: 50_600, lastPmMiles: 48_000, interval: 3000 };
    expect(nextPmDue(r, S)).toBe(51_000);
    expect(pmStatus(r, S)).toBe("due-soon");
  });

  it("is overdue once the reading passes the due mark", () => {
    const r = { ...emptyPmRecord("6435"), odometer: 130_250, lastPmMiles: 124_000 };
    expect(milesRemaining(r, S)).toBe(-250);
    expect(pmStatus(r, S)).toBe("overdue");
  });

  it("is unknown without a last PM or a reading", () => {
    expect(pmStatus({ ...emptyPmRecord("1"), odometer: 10 }, S)).toBe("unknown");
    expect(pmStatus({ ...emptyPmRecord("1"), lastPmMiles: 10 }, S)).toBe("unknown");
  });

  it("sorts overdue first, then due soon, then OK by miles left, then unknown", () => {
    const rows = [
      { ...emptyPmRecord("6400"), odometer: 100, lastPmMiles: 0 }, // ok, 5900 left
      { ...emptyPmRecord("6401") }, // unknown
      { ...emptyPmRecord("6402"), odometer: 6100, lastPmMiles: 0 }, // overdue 100
      { ...emptyPmRecord("6403"), odometer: 5700, lastPmMiles: 0 }, // due soon 300
      { ...emptyPmRecord("6404"), odometer: 7000, lastPmMiles: 0 }, // overdue 1000
    ];
    expect(sortPmRecords(rows, S).map((r) => r.bus)).toEqual(["6404", "6402", "6403", "6400", "6401"]);
  });

  it("parses typed miles leniently and settings safely", () => {
    expect(toMiles("123,456")).toBe(123_456);
    expect(toMiles("123456.6")).toBe(123_457);
    expect(toMiles("")).toBeNull();
    expect(toMiles(-5)).toBeNull();
    expect(normalizePmSettings({ defaultInterval: "4,500", dueSoonMiles: 0 })).toEqual({
      defaultInterval: 4500,
      dueSoonMiles: 0,
    });
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
    expect(accepted[0].readAt).toBe("9/29/26");
    expect(rejected.map((r) => [r.bus, r.reason])).toEqual([
      ["2771", "Bus is retired"],
      ["7777", "Not in the fleet list"],
      ["9690", "No usable odometer reading"],
    ]);
  });
});
