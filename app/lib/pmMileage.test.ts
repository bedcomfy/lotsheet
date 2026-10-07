import { describe, expect, it } from "vitest";
import {
  DEFAULT_PM_SETTINGS,
  INSPECTION_CYCLE,
  TRANS_PM_INTERVAL,
  applyCompletion,
  formatMiles,
  toOdometer,
  emptyPmRecord,
  filterPmWorkItems,
  groupPmWorkItems,
  inspMilesRemaining,
  isPmFleetBus,
  inspectionInterval,
  nextInspection,
  nextInspectionType,
  normalizePmSettings,
  normalizeReportBus,
  pmStatus,
  pmWorkItems,
  pmOperationalFlags,
  pmDisplayDisposition,
  reviewReadings,
  sortPmRecords,
  toMiles,
  transMilesRemaining,
  transNextDue,
} from "./pmMileage";
import { emptyFlagEntry } from "./serviceLaneSetup";

const S = DEFAULT_PM_SETTINGS;

describe("shared flags on PM Mileage", () => {
  it("fills Bus status from shared Split and Inspection Hold flags even without a saved PM status", () => {
    const record = emptyPmRecord("6404");
    const split = { ...emptyFlagEntry(), flags: ["split"] };
    const hold = { ...emptyFlagEntry(), flags: ["hold"], holdReason: "Inspection" };
    expect(pmDisplayDisposition(record, split)).toBe("split");
    expect(pmDisplayDisposition(record, hold)).toBe("hold");
    expect(pmDisplayDisposition(record, { ...hold, holdReason: "Parade" })).toBe("");
    const both = { ...hold, flags: ["split", "hold"] };
    expect(pmDisplayDisposition(record, both)).toBe("hold");
    expect(pmDisplayDisposition({ ...record, disposition: "split" }, both)).toBe("split");
    expect(pmDisplayDisposition({ ...record, disposition: "hold" }, both)).toBe("hold");
  });

  it("shows every Split but only Holds with the exact Inspection reason, ignoring case and whitespace", () => {
    const entry = { ...emptyFlagEntry(), flags: ["split", "hold", "inspection"], holdReason: "  INSPECTION  " };
    expect(pmOperationalFlags(entry)).toEqual(["split", "hold"]);
    for (const holdReason of ["", "Parade", "Cubs Bus", "Inspection parts", "Awaiting inspection"]) {
      expect(pmOperationalFlags({ ...entry, holdReason })).toEqual(["split"]);
    }
    expect(pmOperationalFlags({ ...entry, flags: [], holdReason: "Inspection" })).toEqual([]);
    expect(pmOperationalFlags()).toEqual([]);
  });

  it("hides old PM Hold/Split selections once their shared flag no longer qualifies", () => {
    const hold = { ...emptyPmRecord("6404"), disposition: "hold" as const };
    const entry = { ...emptyFlagEntry(), flags: ["hold"], holdReason: "Inspection" };
    expect(pmDisplayDisposition(hold, entry)).toBe("hold");
    expect(pmDisplayDisposition(hold, { ...entry, holdReason: "Movement" })).toBe("");
    expect(pmDisplayDisposition(hold, { ...entry, flags: [] })).toBe("");
    expect(pmDisplayDisposition({ ...hold, disposition: "split" }, { ...entry, flags: ["split"] })).toBe("split");
    expect(pmDisplayDisposition({ ...hold, disposition: "split" }, { ...entry, flags: [] })).toBe("");
    expect(pmDisplayDisposition({ ...hold, disposition: "shop" }, entry)).toBe("shop");
    expect(pmDisplayDisposition({ ...hold, disposition: "follow-up" }, entry)).toBe("follow-up");
  });
});

describe("PM fleet scope", () => {
  it("excludes 9690 from both PM kinds and imports while keeping regular active buses", () => {
    const fleet = [{ num: "9690", status: "active" as const }, { num: "2771", status: "active" as const }, { num: "2772", status: "retired" as const }];
    expect(fleet.filter(isPmFleetBus).map((bus) => bus.num)).toEqual(["2771"]);
    const records = ["9690", "2771"].map((bus) => ({ ...emptyPmRecord(bus), nextTransMiles: 100000 }));
    expect(pmWorkItems(records, S).map((item) => item.id)).toEqual(["2771:inspection", "2771:trans"]);
    expect(reviewReadings([{ bus: "009690", odometer: 100000 }], fleet, {}).rejected).toEqual([
      { bus: "9690", odometer: 100000, reason: "Excluded from the bus PM program" },
    ]);
  });
});

describe("PM queue sections", () => {
  it("moves only Shop and Follow up to the top section, preserving each PM's mileage order", () => {
    const records = (["", "hold", "split", "shop", "follow-up"] as const).map((disposition, index) => ({
      ...emptyPmRecord(String(6400 + index)), disposition, odometer: 100_000,
      nextInspType: "A-3" as const, nextInspMiles: 99_950 + index * 25, nextTransMiles: 100_250 + index * 25,
    }));
    const work = pmWorkItems(records, S);
    const groups = groupPmWorkItems(work);
    expect(groups.map((g) => g.id)).toEqual(["shop", "queue"]);
    expect(groups[0].items.map((i) => i.record.bus)).toEqual(["6403", "6404", "6403", "6404"]);
    expect(groups[1].items.map((i) => [i.record.bus, i.milesLeft])).toEqual([
      ["6400", -50], ["6401", -25], ["6402", 0], ["6400", 250], ["6401", 275], ["6402", 300],
    ]);
    expect(work[0].record.bus).toBe("6400"); // partition never mutates the source order
    const filtered = filterPmWorkItems(work, "due-soon", "6403", [], (bus) => bus);
    expect(groupPmWorkItems(filtered).map((g) => g.id)).toEqual(["shop"]);
    expect(filtered.map((i) => i.milesLeft)).toEqual([25, 325]);
    expect(groupPmWorkItems([])).toEqual([]);
  });
});

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
  it("omits unscheduled transmission work, but keeps explicit or derived schedules even without an odometer", () => {
    const records = [
      { ...emptyPmRecord("6388"), disposition: "shop" as const, odometer: 383796, nextInspType: "A-3" as const, nextInspMiles: 384000 },
      { ...emptyPmRecord("6461"), nextTransMiles: 480000 },
      { ...emptyPmRecord("6404"), odometer: 100000, lastTransMiles: 25250 },
    ];
    const work = pmWorkItems(records, S);
    expect(work.filter((item) => item.record.bus === "6388").map((item) => item.kind)).toEqual(["inspection"]);
    expect(groupPmWorkItems(work)[0].items.map((item) => item.id)).toEqual(["6388:inspection"]);
    expect(work.filter((item) => item.kind === "trans").map((item) => [item.id, item.dueMiles, item.milesLeft])).toEqual([
      ["6404:trans", 100250, 250], ["6461:trans", 480000, null],
    ]);
  });

  it("runs on a fixed 75,000-mile interval off the odometer", () => {
    const r = { ...emptyPmRecord("6435"), odometer: 190_000, lastTransMiles: 120_000 };
    expect(TRANS_PM_INTERVAL).toBe(75_000);
    expect(transNextDue(r)).toBe(195_000);
    expect(transMilesRemaining(r)).toBe(5_000);
  });

  it("keeps its due mileage independent of the inspection schedule", () => {
    const r = { ...emptyPmRecord("6435"), odometer: 195_300,
      lastInspType: "A-3" as const, lastInspMiles: 194_000, lastTransMiles: 120_000 };
    expect(transNextDue(r)).toBe(195_000);
    expect(transMilesRemaining(r)).toBe(-300);
    expect(pmStatus(r, S)).toBe("overdue");
    const inspectionDone = applyCompletion(r, { kind: "inspection", miles: 197_100, date: null });
    expect(transNextDue(inspectionDone)).toBe(195_000);
  });

});

describe("completing a PM", () => {
  it("moves the completed inspection to last and advances the next", () => {
    const r = { ...emptyPmRecord("6404"), odometer: 123_050, lastInspType: "B-12" as const, lastInspMiles: 120_000 };
    expect(pmStatus(r, S)).toBe("overdue");
    const done = applyCompletion(r, { kind: "inspection", miles: 123_050, date: "10/1/26" });
    expect(done.lastInspType).toBe("A-15");
    // Recorded at the mileage it was due (123,000), not the odometer when done.
    expect(done.lastInspMiles).toBe(123_000);
    expect(done.lastInspDate).toBe("10/1/26");
    expect(done.odometer).toBe(123_050);
    expect(nextInspection(done)).toEqual({ type: "B-18", miles: 126_000, interval: 3000 });
    expect(pmStatus(done, S)).toBe("ok");
    // Done early: still recorded at the due mark, odometer untouched.
    const early = applyCompletion({ ...r, odometer: 122_400 }, { kind: "inspection", miles: 122_400, date: "10/1/26" });
    expect(early.lastInspMiles).toBe(123_000);
    expect(early.odometer).toBe(122_400);
    // A different type than the one due is recorded at the entered mileage.
    const other = applyCompletion(r, { kind: "inspection", type: "B-18", miles: 123_050, date: null });
    expect(other).toMatchObject({ lastInspType: "B-18", lastInspMiles: 123_050 });
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
    expect(done.lastTransMiles).toBe(195_000); // its own due mark
    expect(transNextDue(done)).toBe(270_000);
    const first = applyCompletion({ ...emptyPmRecord("6436"), odometer: 90_000 }, { kind: "trans", miles: 90_000, date: null });
    expect(first.lastTransMiles).toBe(90_000);
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
    { num: "6436", status: "active" },
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
        { bus: "6436", odometer: 0 },
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
      ["6436", "No usable odometer reading"],
    ]);
  });
});


describe("explicit next work", () => {
  it("sets the next inspection without inventing history and advances it on completion", () => {
    const r = { ...emptyPmRecord("6404"), odometer: 100_000, nextInspType: "A-3" as const,
      nextInspMiles: 100_025, nextTransMiles: 100_250 };
    expect(r.lastInspType).toBeNull();
    expect(nextInspection(r)).toEqual({ type: "A-3", miles: 100_025, interval: 3000 });
    const done = applyCompletion(r, { kind: "inspection", miles: 100_030, date: "10/1/26" });
    expect(nextInspection(done)).toEqual({ type: "B-6", miles: 103_025, interval: 3000 });
    expect(done.lastInspMiles).toBe(100_025);
    expect(done.nextInspMiles).toBeNull();
    expect(transNextDue(done)).toBe(100_250);
    const transDone = applyCompletion(r, { kind: "trans", miles: 100_260, date: null });
    expect(transNextDue(transDone)).toBe(175_250);
    expect(nextInspection(transDone)).toEqual(nextInspection(r));
  });

  it("sorts each PM independently, with two distinct rows for the same bus", () => {
    const records = [
      { ...emptyPmRecord("6404"), odometer: 100_000, nextInspType: "A-3" as const, nextInspMiles: 100_025, nextTransMiles: 100_250 },
      { ...emptyPmRecord("6405"), odometer: 100_000, nextInspType: "B-6" as const, nextInspMiles: 100_100 },
    ];
    const items = pmWorkItems(records, S);
    expect(items.map((r) => [r.id, r.milesLeft])).toEqual([
      ["6404:inspection", 25], ["6405:inspection", 100], ["6404:trans", 250],
    ]);
    expect(items.filter((r) => r.status === "due-soon")).toHaveLength(3);
    const progressed = { ...records[0], odometer: 100_050 };
    expect(pmWorkItems([progressed], S).map((r) => r.status)).toEqual(["overdue", "due-soon"]);
  });
});

describe("odometer tenths", () => {
  it("keeps the decimal Fleetwatch prints and strips typed commas", () => {
    expect(toOdometer("425,481.5")).toBe(425481.5);
    expect(toOdometer(100020.44)).toBe(100020.4);
    expect(toOdometer("")).toBeNull();
    expect(toOdometer("abc")).toBeNull();
  });

  it("formats odometers and miles left to the tenth, whole numbers without one", () => {
    expect(formatMiles(425481.5)).toBe("425,481.5");
    expect(formatMiles(103000 - 100020.4)).toBe("2,979.6");
    expect(formatMiles(100000)).toBe("100,000");
  });

  it("carries the tenth into miles left while PM marks stay whole", () => {
    const r = { ...emptyPmRecord("6404"), odometer: 100020.4, nextInspType: "A-3" as const, nextInspMiles: 103000 };
    expect(inspMilesRemaining(r)).toBeCloseTo(2979.6, 6);
    const first = applyCompletion({ ...emptyPmRecord("6457"), odometer: null }, { kind: "inspection", type: "B-6", miles: 100020.4, date: null });
    expect(first.odometer).toBe(100020.4);
    expect(first.lastInspMiles).toBe(100020);
  });
});
