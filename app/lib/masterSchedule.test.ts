import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { appState, pmInspections, pmMileage, pmMileageLog } from "./db/schema";
import { MASTER_SCHEDULE_ID, MASTER_SCHEDULE_ROWS } from "./masterSchedule.data";
import { MASTER_SCHEDULE_KEY, applyMasterScheduleOnce, masterScheduleRows, type MasterScheduleState } from "./masterSchedule";
import { MASTER_UPLOAD_ACTOR } from "./pmHistory";
import { FLUID_KINDS, isInspectionType } from "./pmMileage";
import { getPmMileage, getState, listPmInspections, listPmMileageLog, setState, updatePmMileage } from "./store";
import type { MasterScheduleRow } from "./masterSchedule.data";

const rows: MasterScheduleRow[] = [
  ["6404", "A-15", 103000, 150000, 148000, 150000],
  ["6435", "B-6", 120000, null, null, null],
  ["6500", "A-3", 2, null, null, null], // retired on site
];

describe("the committed master schedule snapshot", () => {
  it("has one row per bus with whole-mile marks and known inspection types", () => {
    const buses = MASTER_SCHEDULE_ROWS.map((row) => row[0]);
    expect(new Set(buses).size).toBe(buses.length);
    expect(buses.length).toBeGreaterThan(100);
    for (const [bus, type, due, trans, hub, diff] of MASTER_SCHEDULE_ROWS) {
      expect(bus).toMatch(/^\d+$/);
      expect(type === null || isInspectionType(type)).toBe(true);
      expect((type === null) === (due === null)).toBe(true);
      for (const mark of [due, trans, hub, diff]) expect(mark === null || Number.isInteger(mark)).toBe(true);
    }
    expect(MASTER_SCHEDULE_ID).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // Hub and diff marks really are separate PMs: some buses carry different marks.
    expect(MASTER_SCHEDULE_ROWS.some(([, , , trans, hub]) => trans !== null && hub !== null && trans !== hub)).toBe(true);
    expect(masterScheduleRows(rows)[0]).toEqual({ bus: "6404", nextInspType: "A-15", nextInspDue: 103000, transDue: 150000, hubDue: 148000, diffDue: 150000, note: null });
  });
});

describe("applying the master schedule once (in-memory Postgres)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.delete(pmMileage);
    await db.delete(pmMileageLog);
    await db.delete(pmInspections);
    await db.delete(appState);
    await setState("bus_master", { buses: [{ num: "6404", status: "active" }, { num: "6435", status: "active" }, { num: "6457", status: "active" }, { num: "6500", status: "retired" }] });
  }, 20_000);

  it("sets every mark from the sheet, keeps odometers, auto-completes replaced PMs, and never runs the same snapshot twice", async () => {
    await updatePmMileage("6404", { odometer: 100020.4, odometerDate: "10/6/26", nextInspType: "A-3", nextInspMiles: 100025, nextTransMiles: 100250 }, "setup");
    const logBefore = (await listPmMileageLog("6404")).length;

    const first = await applyMasterScheduleOnce(rows, "test-1");
    expect(first.ran).toBe(true);
    expect(first.result).toMatchObject({
      id: "test-1", applied: ["6404", "6435"], autoCompleted: 2,
      rejected: [{ bus: "6500", reason: "Bus is retired" }], missingFromMaster: ["6457"],
    });
    const after = (await getPmMileage())["6404"];
    expect(after).toMatchObject({
      odometer: 100020.4, odometerDate: "10/6/26", nextInspType: "A-15", nextInspMiles: 103000, lastInspType: "B-12", lastInspMiles: 100000,
      nextTransMiles: 150000, lastTransMiles: 75000, nextHubMiles: 148000, lastHubMiles: 73000, nextDiffMiles: 150000, lastDiffMiles: 75000,
    });
    expect((await listPmMileageLog("6404")).length).toBe(logBefore);
    expect((await getPmMileage())["6435"]).toMatchObject({ nextInspType: "B-6", nextInspMiles: 120000, nextTransMiles: null, nextHubMiles: null, nextDiffMiles: null });
    const completed = await listPmInspections("6404");
    expect(completed.map((entry) => [entry.kind, entry.miles, entry.actor])).toEqual([["trans", 100250, MASTER_UPLOAD_ACTOR], ["inspection", 100025, MASTER_UPLOAD_ACTOR]]);
    expect(FLUID_KINDS).toEqual(["trans", "hub", "diff"]);

    const stored = (await getState(MASTER_SCHEDULE_KEY)).value as MasterScheduleState;
    expect(stored).toMatchObject({ status: "done", id: "test-1" });

    // Same snapshot again: nothing runs, the stored result comes back.
    await updatePmMileage("6404", { nextInspType: "A-21", nextInspMiles: 109000 }, "shop");
    const again = await applyMasterScheduleOnce(rows, "test-1");
    expect(again).toEqual({ ran: false, result: first.result });
    expect((await getPmMileage())["6404"].nextInspMiles).toBe(109000);

    // A new snapshot id applies on top.
    const next = await applyMasterScheduleOnce([["6404", "B-6", 112000, 150000, 148000, 150000]], "test-2");
    expect(next.ran).toBe(true);
    expect((await getPmMileage())["6404"]).toMatchObject({ nextInspType: "B-6", nextInspMiles: 112000 });
  });

  it("yields to a fresh claim from another instance and takes over a stale or failed one", async () => {
    await setState(MASTER_SCHEDULE_KEY, { id: "test-3", status: "running", startedAt: new Date().toISOString() } satisfies MasterScheduleState);
    expect(await applyMasterScheduleOnce(rows, "test-3")).toEqual({ ran: false, result: null });
    expect((await getPmMileage())["6404"]).toBeUndefined();

    await setState(MASTER_SCHEDULE_KEY, { id: "test-3", status: "running", startedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString() } satisfies MasterScheduleState);
    expect((await applyMasterScheduleOnce(rows, "test-3")).ran).toBe(true);

    await setState(MASTER_SCHEDULE_KEY, { id: "test-4", status: "failed", startedAt: new Date().toISOString(), error: "boom" } satisfies MasterScheduleState);
    expect((await applyMasterScheduleOnce(rows, "test-4")).ran).toBe(true);
    expect((await getState(MASTER_SCHEDULE_KEY)).value).toMatchObject({ status: "done", id: "test-4" });
  });
});
