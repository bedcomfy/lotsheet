import { describe, expect, it } from "vitest";
import { completedBusRows, completionDateText, pmScheduleToken, type PmInspectionEntry } from "./pmHistory";
import { emptyPmRecord, type PmRecord } from "./pmMileage";

describe("Completed PM list", () => {
  it("includes all buses, sorts exact completion times newest first, and leaves unknown dates last", () => {
    const buses = ["1", "2", "3", "4", "5"].map((num) => ({ num, status: "active" }));
    const records: Record<string, PmRecord> = Object.fromEntries(buses.map(({ num }) => [num, { ...emptyPmRecord(num), lastInspType: "A-3" as const, lastInspMiles: 1000, lastInspDate: "10/1/26" }]));
    records["4"].lastInspDate = "9/30/26";
    records["5"] = emptyPmRecord("5");
    records["2"].lastTransMiles = 75000;
    records["2"].lastTransDate = "10/1/26";
    const entry = (bus: string, completedAt: string): PmInspectionEntry => ({ bus, completedAt, id: bus, kind: "inspection", type: "A-3", miles: 1000, odometer: 1025, doneAt: "10/1/26", createdAt: completedAt, undoneAt: null, canUndo: true, undoReason: null });
    const rows = completedBusRows(buses, records, [entry("1", "2026-10-01T17:00:00Z"),
      { ...entry("2", "2026-10-01T18:00:00Z"), kind: "trans", type: null, miles: 75000 },
      { ...entry("3", "2026-10-01T19:00:00Z"), undoneAt: "2026-10-01T20:00:00Z" }]);
    expect(rows.map((row) => row.bus)).toEqual(["2", "1", "3", "4", "5"]);
    expect(rows[0]).toMatchObject({ kind: "trans", completedAt: "2026-10-01T18:00:00Z", odometer: 1025 });
    expect(rows[2].completedAt).toBeNull();
    expect(rows[4].kind).toBeNull();
    expect(completionDateText(rows[0].completedAt, null)).toBe("10/1/2026, 1:00:00 PM");
    expect(completionDateText(null, "9/30/26")).toBe("9/30/26");
  });

  it("isolates each PM's schedule from unrelated bus fields", () => {
    const record = emptyPmRecord("1");
    expect(pmScheduleToken({ ...record, odometer: 1000, disposition: "shop", nextTransMiles: 75000 }, "inspection")).toBe(pmScheduleToken(record, "inspection"));
    expect(pmScheduleToken({ ...record, nextInspType: "A-3", nextInspMiles: 3000 }, "inspection")).not.toBe(pmScheduleToken(record, "inspection"));
  });
});
