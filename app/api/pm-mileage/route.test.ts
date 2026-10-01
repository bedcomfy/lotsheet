import { describe, expect, it } from "vitest";
import { ADMIN_COOKIE, adminToken } from "../../lib/adminAuth";
import { getFlags, getPmMileage, listPmInspections, listPmMileageLog, setBusFlags } from "../../lib/store";
import { DEFAULT_PM_SETTINGS, nextInspection, pmWorkItems, transNextDue } from "../../lib/pmMileage";
import { PATCH, PUT } from "./route";
import { POST as importReport } from "./import/route";
import { POST as applyReadings } from "./readings/route";
import { POST as complete } from "./complete/route";

function request(method: string, body: unknown, admin = false) {
  return new Request("http://localhost/api/pm-mileage", {
    method,
    headers: { "Content-Type": "application/json", ...(admin ? { cookie: `${ADMIN_COOKIE}=${adminToken()}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("PM API access and independent schedules", { timeout: 20_000 }, () => {
  it("allows crew status edits but rejects protected fields and malformed statuses", async () => {
    const initial = { bus: "6404", odometer: 100_000, nextInspType: "A-3", nextInspMiles: 100_025, nextTransMiles: 100_250 };
    expect((await PUT(request("PUT", initial))).status).toBe(401);
    expect((await PUT(request("PUT", initial, true))).status).toBe(200);
    expect((await PATCH(request("PATCH", { bus: "6404", disposition: "hold", odometer: 1 }))).status).toBe(400);
    expect((await PATCH(request("PATCH", { bus: "6404", disposition: "anything" }))).status).toBe(400);
    const saved = await PATCH(request("PATCH", { bus: "6404", disposition: "shop" }));
    expect(saved.status).toBe(200);
    expect((await saved.json()).record).toMatchObject({ ...initial, disposition: "shop", lastInspType: null, lastInspMiles: null });
    expect((await PATCH(request("PATCH", { bus: "6404", disposition: "" }))).status).toBe(200);
    expect((await listPmMileageLog("6404"))).toHaveLength(1);
    expect((await listPmInspections("6404"))).toHaveLength(0);
    expect((await PUT(request("PUT", { bus: "6404", nextInspType: "B-6" }, true))).status).toBe(400);
    expect((await PUT(request("PUT", { bus: "6404", nextInspType: "B-6", nextInspMiles: -1 }, true))).status).toBe(400);
  });

  it("preserves status during a concurrent admin edit", async () => {
    await PUT(request("PUT", { bus: "6435", odometer: 100_000 }, true));
    await Promise.all([
      PATCH(request("PATCH", { bus: "6435", disposition: "follow-up" })),
      PUT(request("PUT", { bus: "6435", nextInspType: "B-6", nextInspMiles: 102_000 }, true)),
    ]);
    expect((await getPmMileage())["6435"]).toMatchObject({ disposition: "follow-up", nextInspType: "B-6", nextInspMiles: 102_000 });
  });

  it("imports the two PDF activities, applies them, reloads them, and completes only the selected PM", async () => {
    const lines = [
      "Total Fleet PM Status Report 30/SEP/2026",
      "6417 2,975 25 PM-A 3000 MILES 2120110 100,000 100,025",
      "6417 74,750 250 TRANS P.M. 75000 2120111 100,000 100,250",
      "6417 74,750 250 CHANGE FRONT HUB 2120112 100,000 100,250",
    ];
    const scanned = await importReport(request("POST", {
      fileName: "two-pms.pdf", pages: [lines.map((text, i) => ({ text, x: 0, y: 700 - i * 20, dirX: 1, dirY: 0 }))],
    }, true));
    expect(scanned.status).toBe(200);
    const review = await scanned.json();
    expect(review.accepted).toHaveLength(1);
    expect(review.accepted[0]).toMatchObject({ bus: "6417", nextInspType: "A-3", nextInspDue: 100_025, transDue: 100_250 });
    expect((await applyReadings(request("POST", { readings: review.accepted }, true))).status).toBe(200);
    let record = (await getPmMileage())["6417"];
    expect(pmWorkItems([record], DEFAULT_PM_SETTINGS).map((r) => [r.kind, r.milesLeft])).toEqual([["inspection", 25], ["trans", 250]]);

    // Daily odometer-only imports preserve both independently stored schedules.
    expect((await applyReadings(request("POST", { readings: [{ bus: "6417", odometer: 100_010 }] }, true))).status).toBe(200);
    record = (await getPmMileage())["6417"];
    expect(nextInspection(record)?.miles).toBe(100_025);
    expect(transNextDue(record)).toBe(100_250);

    const body = { bus: "6417", kind: "inspection", miles: 100_030, date: "10/1/26" };
    expect((await complete(request("POST", body))).status).toBe(401);
    expect((await complete(request("POST", body, true))).status).toBe(200);
    record = (await getPmMileage())["6417"];
    expect(nextInspection(record)?.miles).toBe(103_025);
    expect(transNextDue(record)).toBe(100_250);
    expect((await listPmInspections("6417"))).toMatchObject([{ kind: "inspection", type: "A-3", miles: 100_025 }]);
    await setBusFlags("6417", { flags: ["inspection"], inspOption: "B-6" });
    expect((await complete(request("POST", { bus: "6417", kind: "trans", miles: 100_260, clearFlag: true }, true))).status).toBe(200);
    record = (await getPmMileage())["6417"];
    expect(transNextDue(record)).toBe(175_250);
    expect(nextInspection(record)?.miles).toBe(103_025);
    expect((await getFlags())["6417"].flags).toContain("inspection");
  });
});
