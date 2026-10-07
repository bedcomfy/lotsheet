import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { pmMileage, pmMileageLog } from "./db/schema";
import { applyPmReadings, getPmMileage, listPmInspections, listPmMileageLog, setState, updatePmMileage } from "./store";
import { pmInspections } from "./db/schema";
import { MASTER_UPLOAD_ACTOR, completionCreditLabel } from "./pmHistory";
import { emptyPmRecord, reviewReadings } from "./pmMileage";

describe("schedule-only readings from the tracker workbook (in-memory Postgres)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.delete(pmMileage);
    await db.delete(pmMileageLog);
    await db.delete(pmInspections);
    await setState("bus_master", { buses: [{ num: "6404", status: "active" }, { num: "6435", status: "active" }] });
  }, 20_000);

  it("reviews with the odometer on file and applies only the PM marks, leaving mileage and history alone", async () => {
    await updatePmMileage("6404", { odometer: 100020.4, odometerDate: "10/6/26", nextInspType: "A-3", nextInspMiles: 100025, nextTransMiles: 100250, note: "keep me" }, "setup");
    const before = (await getPmMileage())["6404"];
    const logBefore = (await listPmMileageLog("6404")).length;
    const review = reviewReadings(
      [{ bus: "6404", odometer: null, scheduleOnly: true, nextInspType: "A-15", nextInspDue: 103000, lastInspType: "B-12", lastInspMiles: 100000, transDue: 150000, lastTransMiles: 75000 },
       { bus: "6435", odometer: null, scheduleOnly: true, nextInspType: null, nextInspDue: null, transDue: null, note: "Inspection type not recognized: Oil change" }],
      [{ num: "6404", status: "active" }, { num: "6435", status: "active" }],
      await getPmMileage(),
    );
    expect(review.accepted).toHaveLength(1);
    expect(review.accepted[0]).toMatchObject({ bus: "6404", odometer: 100020.4, scheduleOnly: true, previous: 100020.4, delta: 0, warning: null });
    expect(review.rejected).toEqual([{ bus: "6435", odometer: null, reason: "Inspection type not recognized: Oil change" }]);

    const result = await applyPmReadings(review.accepted, "tracker", "test");
    expect(result.applied).toEqual(["6404"]);
    const after = (await getPmMileage())["6404"];
    expect(after).toMatchObject({
      ...before, nextInspType: "A-15", nextInspMiles: 103000, lastInspType: "B-12", lastInspMiles: 100000, lastInspDate: null,
      nextTransMiles: 150000, lastTransMiles: 75000, updatedAt: after.updatedAt,
    });
    expect(after.odometer).toBe(100020.4);
    expect(after.odometerDate).toBe("10/6/26");
    expect(after.source).toBe(before.source);
    expect((await listPmMileageLog("6404")).length).toBe(logBefore);
    expect(emptyPmRecord("6404").odometer).toBeNull();

    // Both marks moved forward, so the PMs they replaced show on the Completed
    // page, credited to the master upload and undoable.
    expect(result.autoCompleted).toBe(2);
    const entries = await listPmInspections("6404");
    expect(entries.map((entry) => [entry.kind, entry.type, entry.miles, entry.odometer, entry.actor, entry.canUndo])).toEqual([
      ["trans", null, 100250, 100020.4, MASTER_UPLOAD_ACTOR, true],
      ["inspection", "A-3", 100025, 100020.4, MASTER_UPLOAD_ACTOR, true],
    ]);
    expect(completionCreditLabel(entries[0])).toBe("Auto-completed by master upload");

    // The same sheet again, or a mark corrected downward, completes nothing.
    const again = await applyPmReadings(review.accepted, "tracker", "test");
    expect(again.autoCompleted).toBe(0);
    const lower = await applyPmReadings([{ bus: "6404", odometer: null, scheduleOnly: true, readAt: null, nextInspType: "B-6", nextInspDue: 101000, transDue: 120000 }], "tracker", "test");
    expect(lower.autoCompleted).toBe(0);
    expect((await listPmInspections("6404")).length).toBe(2);
  });

  it("moves the hub and diff marks on their own and auto-completes each one separately", async () => {
    await updatePmMileage("6454", { odometer: 440000, nextTransMiles: 449267, nextHubMiles: 443182, nextDiffMiles: 449267 }, "setup");
    await setState("bus_master", { buses: [{ num: "6454", status: "active" }] });
    const review = reviewReadings(
      [{ bus: "6454", odometer: null, scheduleOnly: true, transDue: 449267, hubDue: 518182, lastHubMiles: 443182, diffDue: 449267 }],
      [{ num: "6454", status: "active" }],
      await getPmMileage(),
    );
    expect(review.accepted).toHaveLength(1);
    const result = await applyPmReadings(review.accepted, "tracker", "test");
    expect(result.autoCompleted).toBe(1);
    const after = (await getPmMileage())["6454"];
    expect(after).toMatchObject({ odometer: 440000, nextTransMiles: 449267, nextHubMiles: 518182, lastHubMiles: 443182, nextDiffMiles: 449267 });
    const entries = await listPmInspections("6454");
    expect(entries.map((entry) => [entry.kind, entry.miles, entry.odometer, entry.actor])).toEqual([["hub", 443182, 440000, MASTER_UPLOAD_ACTOR]]);
  });
});
