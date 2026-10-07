import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { pmMileage, pmMileageLog } from "./db/schema";
import { applyPmReadings, getPmMileage, listPmMileageLog, setState, updatePmMileage } from "./store";
import { emptyPmRecord, reviewReadings } from "./pmMileage";

describe("schedule-only readings from the tracker workbook (in-memory Postgres)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.delete(pmMileage);
    await db.delete(pmMileageLog);
    await setState("bus_master", { buses: [{ num: "6404", status: "active" }, { num: "6435", status: "active" }] });
  }, 20_000);

  it("reviews with the odometer on file and applies only the PM marks, leaving mileage and history alone", async () => {
    await updatePmMileage("6404", { odometer: 100020.4, odometerDate: "10/6/26", nextInspType: "A-3", nextInspMiles: 100025, note: "keep me" }, "setup");
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
  });
});
