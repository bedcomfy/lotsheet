import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../lib/adminAuth", () => ({ isAdminRequest: () => true, unauthorized: () => new Response("no", { status: 401 }) }));
import { POST } from "./route";
import { getDb } from "../../../lib/db";
import { pmMileage, pmMileageLog } from "../../../lib/db/schema";
import { setState, updatePmMileage } from "../../../lib/store";
import { emptyPmRecord } from "../../../lib/pmMileage";
import { buildTrackerWorkbook, trackerRows } from "../../../lib/pmTracker";

describe("Import PDF takes the tracker workbook (in-memory Postgres)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.delete(pmMileage);
    await db.delete(pmMileageLog);
    await setState("bus_master", { buses: [{ num: "6404", status: "active" }, { num: "6435", status: "active" }, { num: "6457", status: "active" }] });
    await updatePmMileage("6404", { odometer: 100020.4 }, "setup");
  }, 20_000);

  it("reviews the schedule with the odometer on file and names active buses the sheet leaves out", async () => {
    const records = { "6404": { ...emptyPmRecord("6404"), odometer: 1, nextInspType: "A-15" as const, nextInspMiles: 103000, nextTransMiles: 100250 } };
    const workbook = await buildTrackerWorkbook(trackerRows(records, [{ num: "6404", status: "active" }]));
    const body = new FormData();
    body.append("file", new File([new Uint8Array(workbook)], "PNW DAILY P.M. TRACKER.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const response = await POST(new Request("https://nwmaint.app/api/pm-mileage/import", { method: "POST", body }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ format: "tracker", rawCount: 1, missingFromTracker: ["6435", "6457"] });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({
      bus: "6404", scheduleOnly: true, odometer: 100020.4, nextInspType: "A-15", nextInspDue: 103000,
      lastInspType: "B-12", lastInspMiles: 100000, transDue: 100250, lastTransMiles: 25250, warning: null,
    });
    expect(result.notes).toMatch(/odometers stay/);
  });
});
