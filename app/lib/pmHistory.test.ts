import { describe, expect, it } from "vitest";
import { MASTER_UPLOAD_ACTOR, completedBusRows, completionCreditLabel, completionDateText, pmScheduleToken, type PmInspectionEntry } from "./pmHistory";
import { emptyPmRecord } from "./pmMileage";

describe("Completed PM list", () => {
  it("includes all buses but shows PMs only from the site log, with undone entries excluded", () => {
    const buses = ["1", "2", "3", "4", "5"].map((num) => ({ num, status: "active" }));
    const entry = (bus: string, completedAt: string): PmInspectionEntry => ({ bus, completedAt, id: bus, kind: "inspection", type: "A-3", miles: 1000, odometer: 1025, doneAt: "10/1/26", createdAt: completedAt, undoneAt: null, canUndo: true, undoReason: null, foremanSr: null });
    const rows = completedBusRows(buses, [entry("1", "2026-10-01T17:00:00Z"),
      { ...entry("2", "2026-10-01T18:00:00Z"), kind: "trans", type: null, miles: 75000 },
      { ...entry("3", "2026-10-01T19:00:00Z"), undoneAt: "2026-10-01T20:00:00Z" }]);
    expect(rows.map((row) => row.bus)).toEqual(["2", "1", "3", "4", "5"]);
    expect(rows[0]).toMatchObject({ kind: "trans", completedAt: "2026-10-01T18:00:00Z", miles: 75000 });
    expect(rows[1].miles).toBe(1000);
    expect(rows.slice(2).every((row) => row.kind === null && row.miles === null && row.completedAt === null)).toBe(true);
    expect(completionDateText(rows[0].completedAt)).toBe("10/1/2026, 1:00:00 PM");
    expect(completionDateText(null)).toBe("Date and time not recorded");
  });

  it("uses the site save time for older completions and returns to the previous entry after undo", () => {
    const base: PmInspectionEntry = { bus: "1", id: "1", kind: "inspection", type: "A-3", miles: 1000,
      odometer: 1025, doneAt: "9/30/26", completedAt: null, createdAt: "2026-10-01T17:12:34Z", undoneAt: null, canUndo: false, undoReason: null, foremanSr: null };
    const rows = completedBusRows([{ num: "1", status: "active" }], [
      { ...base, id: "3", type: "A-9", completedAt: "2026-10-01T19:00:00Z", undoneAt: "2026-10-01T19:10:00Z" },
      { ...base, id: "2", type: "B-6", completedAt: "2026-10-01T16:00:00Z" }, base,
    ]);
    expect(rows[0]).toMatchObject({ type: "A-3", miles: 1000, completedAt: base.createdAt });
    expect(completionDateText(rows[0].completedAt)).toBe("10/1/2026, 12:12:34 PM");
  });

  it("isolates each PM's schedule from unrelated bus fields", () => {
    const record = emptyPmRecord("1");
    expect(pmScheduleToken({ ...record, odometer: 1000, disposition: "shop", nextTransMiles: 75000 }, "inspection")).toBe(pmScheduleToken(record, "inspection"));
    expect(pmScheduleToken({ ...record, nextInspType: "A-3", nextInspMiles: 3000 }, "inspection")).not.toBe(pmScheduleToken(record, "inspection"));
  });
});

describe("Completed-by label", () => {
  it("says whether a PM was auto-completed by the master upload or completed manually", () => {
    expect(completionCreditLabel({ foremanSr: null, actor: MASTER_UPLOAD_ACTOR })).toBe("Auto-completed by master upload");
    expect(completionCreditLabel({ foremanSr: null, actor: "device-1" })).toBe("Completed manually");
    expect(completionCreditLabel({ foremanSr: null })).toBe("Completed manually");
    expect(completionCreditLabel({ foremanSr: "Jordan Smith", actor: "device-1" })).toBe("Completed manually by Jordan Smith");
  });
});
