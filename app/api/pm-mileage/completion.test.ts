import { describe, expect, it } from "vitest";
import { getFlags, getPmMileage, listPmInspections, setBusFlags, setState, updatePmMileage } from "../../lib/store";
import { emptyPmRecord, nextInspection, transNextDue, type PmKind } from "../../lib/pmMileage";
import { pmScheduleToken } from "../../lib/pmHistory";
import { POST as complete } from "./complete/route";
import { POST as undo } from "./undo/route";
import { GET as history } from "./history/route";

const req = (body: unknown, origin?: string) => new Request("http://localhost/api/pm-mileage", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
});
async function payload(bus: string, kind: PmKind = "inspection") {
  return { bus, kind, miles: 100050, completedAt: new Date().toISOString(), requestId: crypto.randomUUID(),
    expectedSchedule: pmScheduleToken((await getPmMileage())[bus] || emptyPmRecord(bus), kind), clearFlag: true };
}
async function seed(bus: string) {
  await updatePmMileage(bus, { odometer: 100000, lastInspType: "C-24", lastInspMiles: 97025, lastInspDate: "9/1/26",
    lastTransMiles: null, lastTransDate: null, nextInspType: "A-3", nextInspMiles: 100025, nextTransMiles: 100250 });
}

describe("Crew completion and undo transactions", { timeout: 20_000 }, () => {
  it("records the actual time/odometer once, and undo preserves later mileage, other PMs, status, notes and flags", async () => {
    await seed("6404");
    await setBusFlags("6404", { flags: ["inspection", "hold"], inspOption: "A-3", inspMiles: 100025, note: "Flag note", holdReason: "Parts" });
    const body = await payload("6404");
    const responses = await Promise.all([complete(req(body)), complete(req(body))]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const [entry] = await listPmInspections("6404");
    expect(await listPmInspections("6404")).toHaveLength(1);
    expect(entry).toMatchObject({ completedAt: body.completedAt, odometer: 100050, miles: 100025, canUndo: true, type: "A-3" });
    expect((await getFlags())["6404"].flags).toEqual(["hold"]);
    expect((await complete(req(await payload("6404", "trans")))).status).toBe(200);
    await updatePmMileage("6404", { odometer: 100500, odometerDate: "10/2/26", disposition: "split", note: "PM note" });
    expect((await undo(req({ id: entry.id }))).status).toBe(200);
    const record = (await getPmMileage())["6404"];
    expect(record).toMatchObject({ odometer: 100500, odometerDate: "10/2/26", disposition: "split", note: "PM note", lastInspType: "C-24", lastInspMiles: 97025 });
    expect(nextInspection(record)).toMatchObject({ type: "A-3", miles: 100025 });
    expect(transNextDue(record)).toBe(175250);
    expect((await getFlags())["6404"]).toMatchObject({ flags: expect.arrayContaining(["inspection", "hold", "split"]), inspOption: "A-3", inspMiles: 100025, note: "Flag note", holdReason: "Parts" });
    expect((await undo(req({ id: entry.id }))).status).toBe(200);
    expect((await listPmInspections("6404")).find((e) => e.id === entry.id)).toMatchObject({ canUndo: false, undoneAt: expect.any(String) });
    expect((await complete(req(body))).status).toBe(409);
  });

  it("rejects stale confirmations and newer schedule edits; undo proceeds newest first", async () => {
    await seed("6417");
    const body = await payload("6417");
    const simultaneous = await Promise.all([complete(req(body)), complete(req({ ...body, requestId: crypto.randomUUID() }))]);
    expect(simultaneous.map((r) => r.status).sort()).toEqual([200, 409]);
    const [first] = await listPmInspections("6417");
    expect((await complete(req(await payload("6417")))).status).toBe(200);
    const [second] = await listPmInspections("6417");
    expect((await undo(req({ id: first.id }))).status).toBe(409);
    expect((await undo(req({ id: second.id }))).status).toBe(200);
    expect((await listPmInspections("6417")).find((e) => e.id === first.id)?.canUndo).toBe(true);
    await updatePmMileage("6417", { nextInspType: "B-12", nextInspMiles: 104000 });
    expect((await undo(req({ id: first.id }))).status).toBe(409);
    expect(nextInspection((await getPmMileage())["6417"])).toMatchObject({ type: "B-12", miles: 104000 });
  });

  it("does not overwrite a later inspection flag or partially undo its schedule", async () => {
    await seed("6435");
    await setBusFlags("6435", { flags: ["inspection"], inspOption: "A-3" });
    expect((await complete(req(await payload("6435")))).status).toBe(200);
    const [entry] = await listPmInspections("6435");
    await setBusFlags("6435", { flags: ["inspection"], inspOption: "B-6" });
    expect((await undo(req({ id: entry.id }))).status).toBe(409);
    expect(nextInspection((await getPmMileage())["6435"])?.miles).toBe(103025);
    expect((await getFlags())["6435"].inspOption).toBe("B-6");
    expect((await listPmInspections("6435"))[0].undoneAt).toBeNull();
  });

  it("validates crew input and rejects cross-site, unscheduled, excluded, and overridden work", async () => {
    await seed("6450");
    const body = await payload("6450");
    for (const miles of ["", " ", 0, -1, 1.5, "abc", 2147483648]) expect((await complete(req({ ...body, miles }))).status).toBe(400);
    expect((await complete(req(body, "https://other.example"))).status).toBe(403);
    expect((await undo(req({ id: "1" }, "https://other.example"))).status).toBe(403);
    expect((await complete(req({ ...body, disposition: "shop" }))).status).toBe(400);
    expect((await complete(req({ ...body, completedAt: "2000-01-01T00:00:00Z" }))).status).toBe(400);
    expect((await complete(req({ ...body, type: "B-12" }))).status).toBe(409);
    expect((await complete(req(await payload("9690")))).status).toBe(409);
    expect((await complete(req(await payload("6451")))).status).toBe(409);
    expect(await listPmInspections("6450")).toHaveLength(0);
    expect((await undo(req({ id: "0" }))).status).toBe(400);
    expect((await undo(req({ id: "99999" }))).status).toBe(409);
  });

  it("uses the saved fleet and includes both kinds in the public history", async () => {
    await setState("bus_master", { buses: [{ num: "90001", status: "active" }] });
    await seed("90001");
    expect((await complete(req(await payload("90001")))).status).toBe(200);
    expect((await complete(req(await payload("90001", "trans")))).status).toBe(200);
    const response = await history(new Request("http://localhost/api/pm-mileage/history?bus=90001"));
    const entries = (await response.json()).entries;
    expect(entries.map((e: { kind: string }) => e.kind)).toEqual(["trans", "inspection"]);
    expect(entries.every((e: { canUndo: boolean }) => e.canUndo)).toBe(true);
    expect((await complete(req(await payload("6450")))).status).toBe(409);
  });
});
