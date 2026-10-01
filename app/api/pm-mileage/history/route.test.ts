import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PATCH } from "./route";
import { ADMIN_COOKIE, adminToken } from "../../../lib/adminAuth";
import { getDb } from "../../../lib/db";
import { pmInspections } from "../../../lib/db/schema";
import { getPmMileage, listAuditEvents, listPmInspections, updatePmMileage } from "../../../lib/store";

function request(body: unknown, admin = true, origin?: string) {
  return new Request("http://localhost/api/pm-mileage/history", { method: "PATCH",
    headers: { "Content-Type": "application/json", ...(admin ? { cookie: `${ADMIN_COOKIE}=${adminToken()}` } : {}), ...(origin ? { origin } : {}) },
    body: JSON.stringify(body) });
}

describe("PM completion name corrections", { timeout: 20_000 }, () => {
  it("corrects an older receipt without changing its history, PM schedule, or undo availability", async () => {
    const db = await getDb();
    await updatePmMileage("6402", { odometer: 495767, lastInspType: "A-3", lastInspMiles: 495176, lastInspDate: "09/30/26" });
    const [before] = await db.insert(pmInspections).values({ bus: "6402", kind: "inspection", type: "A-3", miles: 495176,
      doneAt: "09/30/26", actor: "original-device", createdAt: new Date("2026-10-01T02:22:40.091Z") }).returning();
    const record = (await getPmMileage())["6402"];
    const body = { id: String(before.id), bus: "6402", foremanSr: "  Edwin Figueroa  ", expectedForemanSr: null, actor: "Authorized correction" };
    expect((await PATCH(request(body))).status).toBe(200);
    const [after] = await db.select().from(pmInspections).where(eq(pmInspections.id, before.id));
    expect(after).toEqual({ ...before, foremanSr: "Edwin Figueroa" });
    expect((await getPmMileage())["6402"]).toEqual(record);
    expect((await listPmInspections("6402"))[0]).toMatchObject({ foremanSr: "Edwin Figueroa", canUndo: true, undoneAt: null });
    const audit = await listAuditEvents();
    expect(audit[0]).toMatchObject({ kind: "pm_completion_update", actor: "Authorized correction",
      details: { id: String(before.id), bus: "6402", before: { foremanSr: null }, after: { foremanSr: "Edwin Figueroa" } } });
    expect((await PATCH(request(body))).status).toBe(200);
    expect(await listAuditEvents()).toEqual(audit);
    expect((await PATCH(request({ ...body, foremanSr: "Another name" }))).status).toBe(409);
    expect((await PATCH(request({ ...body, bus: "6510" }))).status).toBe(409);
    expect((await db.select().from(pmInspections).where(eq(pmInspections.id, before.id)))[0]).toEqual(after);
  });

  it("requires admin access, validates the name, and rejects attempts to edit completion facts", async () => {
    const body = { id: "1", bus: "6402", foremanSr: "Edwin Figueroa", expectedForemanSr: null };
    expect((await PATCH(request(body, false))).status).toBe(401);
    expect((await PATCH(request(body, true, "https://other.example"))).status).toBe(403);
    for (const foremanSr of ["", " ", "a".repeat(121), 123, null]) expect((await PATCH(request({ ...body, foremanSr }))).status).toBe(400);
    for (const id of ["0", "9007199254740992", "invalid"]) expect((await PATCH(request({ ...body, id }))).status).toBe(400);
    expect((await PATCH(request({ ...body, miles: 1 }))).status).toBe(400);
    expect((await PATCH(request({ ...body, completedAt: new Date().toISOString() }))).status).toBe(400);
    expect((await PATCH(request({ ...body, id: "999999" }))).status).toBe(409);
  });
});
