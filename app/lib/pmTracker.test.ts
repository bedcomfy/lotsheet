import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { emptyPmRecord } from "./pmMileage";
import { THD_SCHEDULES, THD_SHEET, TRACKER_SHEET, buildTrackerWorkbook, odometerLinesFor, odometerTable, trackerInspectionLabel, trackerRows } from "./pmTracker";

const fleet = [
  { num: "6404", status: "active" }, { num: "6435", status: "active" },
  { num: "6500", status: "retired" }, { num: "6457", status: "active" },
];
const records = {
  "6404": { ...emptyPmRecord("6404"), odometer: 100020.4, nextInspType: "A-15" as const, nextInspMiles: 103000, nextTransMiles: 100250 },
  "6435": { ...emptyPmRecord("6435"), odometer: 120100, nextInspType: "B-6" as const, nextInspMiles: 120000 },
  "6500": { ...emptyPmRecord("6500"), odometer: 1, nextInspType: "A-3" as const, nextInspMiles: 2 },
};

describe("tracker workbook", () => {
  it("labels inspections the way the fleet system prints them", () => {
    expect(trackerInspectionLabel("A-15")).toBe("PM-A 15000 MILES");
    expect(trackerInspectionLabel("C-24")).toBe("PM-C 24000 MILES");
    expect(trackerInspectionLabel("A-3")).toBe("PM-A 3000 MILES");
  });

  it("lists active buses soonest first, blanks for a bus with nothing on file, and skips retired buses", () => {
    const rows = trackerRows(records, fleet);
    expect(rows.inspections.map((row) => [row.bus, row.milesLeft])).toEqual([["6435", -100], ["6404", 103000 - 100020.4], ["6457", null]]);
    expect(rows.trans).toEqual([{ bus: "6404", odometer: 100020.4, due: 100250, milesLeft: 100250 - 100020.4 }]);
  });

  it("writes both sheets with the shop's headers, live formulas and tenths", async () => {
    const buffer = await buildTrackerWorkbook(trackerRows(records, fleet));
    const workbook = new ExcelJS.Workbook();
    // exceljs types its input as an ArrayBuffer-like Buffer; a Node Buffer works at runtime.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([TRACKER_SHEET, THD_SHEET]);
    const tracker = workbook.getWorksheet(TRACKER_SHEET)!;
    expect(tracker.getRow(1).values).toEqual([undefined, "Bus #", "Current Odometer (UPDATE DAILY)", "Inspection Due", "Miles until next Insp", "Next Insp Type", "Workorder"]);
    expect(tracker.getCell("A3").value).toBe(6404);
    expect(tracker.getCell("B3").value).toBe(100020.4);
    expect(tracker.getCell("C3").value).toBe(103000);
    expect(tracker.getCell("D3").value).toMatchObject({ formula: "C3-B3" });
    expect(tracker.getCell("B3").numFmt).toBe("0.0");
    expect(tracker.getCell("E3").value).toBe("PM-A 15000 MILES");
    expect(tracker.getCell("A4").value).toBe(6457);
    expect(tracker.getCell("B4").value).toBeNull();
    expect(tracker.getCell("D4").value).toBeNull(); // no formula over blanks: Excel would show 0.0
    const thd = workbook.getWorksheet(THD_SHEET)!;
    expect(thd.getRow(1).values).toEqual([undefined, "Vehicle Number", "PM Schedule", "Inspection Due", "Current Mileage", "Miles Till Next Inspection"]);
    expect([2, 3, 4].map((n) => thd.getCell(`B${n}`).value)).toEqual([...THD_SCHEDULES]);
    expect(thd.getCell("C2").value).toBe(100250);
    expect(thd.getCell("D2").value).toBe(100020.4);
    expect(thd.getCell("E4").value).toMatchObject({ formula: "C4-D4" });
  });
});

describe("copying odometers into the hand-kept tracker", () => {
  it("returns one odometer line per pasted bus line, in the sheet's order, blanks for unknown buses", () => {
    const paste = odometerLinesFor("6435\n6404\n9999\n\n6435\n", records);
    expect(paste.lines).toEqual(["120100.0", "100020.4", "", "", "120100.0"]);
    expect(paste).toMatchObject({ buses: 4, matched: 3, unmatched: ["9999"], skipped: [] });
  });

  it("takes the first column of a multi-column paste, strips leading zeros, and reports a pasted header", () => {
    const paste = odometerLinesFor("Bus #\t Current Odometer\r\n006404\t100000\r\n", records);
    expect(paste.lines).toEqual(["", "100020.4"]);
    expect(paste.skipped).toEqual(["Bus #"]);
    expect(paste.matched).toBe(1);
  });

  it("lists every active bus with a reading as bus-tab-odometer lines", () => {
    expect(odometerTable(records, fleet)).toBe("6404\t100020.4\n6435\t120100.0");
  });
});
