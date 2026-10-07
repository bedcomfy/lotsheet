import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { emptyPmRecord } from "./pmMileage";
import { THD_SCHEDULES, THD_SHEET, TRACKER_SHEET, buildTrackerWorkbook, odometerLinesFor, odometerTable, parseTrackerWorkbook, trackerInspectionLabel, trackerLabelToType, trackerRows } from "./pmTracker";

const fleet = [
  { num: "6404", status: "active" }, { num: "6435", status: "active" },
  { num: "6500", status: "retired" }, { num: "6457", status: "active" },
];
const records = {
  "6404": { ...emptyPmRecord("6404"), odometer: 100020.4, nextInspType: "A-15" as const, nextInspMiles: 103000, nextTransMiles: 100250, nextHubMiles: 100300 },
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
    expect(rows.fluids).toEqual([
      { bus: "6404", kind: "trans", odometer: 100020.4, due: 100250, milesLeft: 100250 - 100020.4 },
      { bus: "6404", kind: "hub", odometer: 100020.4, due: 100300, milesLeft: 100300 - 100020.4 },
    ]);
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
    expect([2, 3].map((n) => [thd.getCell(`A${n}`).value, thd.getCell(`B${n}`).value, thd.getCell(`C${n}`).value])).toEqual([
      [6404, THD_SCHEDULES[0], 100250], // TRANS P.M. 75000
      [6404, THD_SCHEDULES[1], 100300], // CHANGE FRONT HUB FLUID
    ]);
    expect(thd.getCell("D2").value).toBe(100020.4);
    expect(thd.getCell("E3").value).toMatchObject({ formula: "C3-D3" });
    expect(thd.getCell("A4").value).toBeNull(); // no differential mark on file: no row
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

describe("reading the shop's tracker for the PM schedule", () => {
  it("maps the sheet's labels to inspection types by the mark, typos included", () => {
    expect(trackerLabelToType("PM-A 15000 MILES")).toBe("A-15");
    expect(trackerLabelToType("PM-6 6000 MILES")).toBe("B-6");
    expect(trackerLabelToType("PM-c 24000 MILES")).toBe("C-24");
    expect(trackerLabelToType("TRANS P.M. 75000")).toBeNull();
    expect(trackerLabelToType("")).toBeNull();
  });

  it("round-trips the workbook this app writes", async () => {
    const parsed = await parseTrackerWorkbook(await buildTrackerWorkbook(trackerRows(records, fleet)));
    expect(parsed.sheets).toEqual([TRACKER_SHEET, THD_SHEET]);
    expect(parsed.rows).toEqual([
      { bus: "6404", nextInspType: "A-15", nextInspDue: 103000, transDue: 100250, hubDue: 100300, diffDue: null, note: null },
      { bus: "6435", nextInspType: "B-6", nextInspDue: 120000, transDue: null, hubDue: null, diffDue: null, note: null },
      { bus: "6457", nextInspType: null, nextInspDue: null, transDue: null, hubDue: null, diffDue: null, note: null }, // listed, nothing on file
    ]);
  });

  it("reads the hand-kept layout: text numbers, odd labels, one row per fluid PM, and skips a pasted report", async () => {
    const workbook = new ExcelJS.Workbook();
    const tracker = workbook.addWorksheet("PNW DAILY P,M. TRACKER");
    tracker.addRow(["Bus #", "Current Odometer (UPDATE DAILY)", "Inspection Due ", "Miles until next Insp", "Next Insp Type", "Workorder"]);
    tracker.addRow([6416, 424880.69, "424636", { formula: "C2-B2", result: -244.69 }, "PM-6 6000 MILES"]);
    tracker.addRow([2779, 428434.09, 428422, { formula: "C3-B3", result: -12.09 }, "PM-A 15000 MILES"]);
    tracker.addRow([6565, "406751", "409751", { formula: "C4-B4", result: 3000 }, "PM-A 3000 MILES"]);
    tracker.addRow([6420, 425641.69, "428642", { formula: "C5-B5", result: 3000.31 }, "Oil change"]);
    const thd = workbook.addWorksheet("T,H,D P.M.");
    thd.addRow(["Vehicle Number", "PM Schedule", "Inspection Due", "PNW DAILY P,M. TRACKER'!", "Miles Till Next Inspection"]);
    thd.addRow(["6464", "CHANGE DIFFERENTIAL FLUID", "448572", 438008, { formula: "C2-D2", result: 10564 }]);
    thd.addRow(["6464", "TRANS P.M. 75000", "448572", "438008", { formula: "C3-D3", result: 10564 }]);
    thd.addRow(["2779", "TRANS P.M. 75000", "450000", 428434, { formula: "C4-D4", result: 21566 }]);
    thd.addRow(["2779", "CHANGE FRONT HUB FLUID", "443182", 428434, { formula: "C5-D5", result: 14748 }]);
    thd.addRow(["2779", "CHANGE DIFFERENTIAL FLUID", "450000", 428434, { formula: "C6-D6", result: 21566 }]);
    const pasted = workbook.addWorksheet("TOTAL FLEET P.M. REPORT 9-30-26");
    pasted.addRow(["Vehicle Number", "PM Interval", "PM Schedule", "Inspection Due", "Current Mileage", "Miles Till Next Inspection"]);
    pasted.addRow(["2779", "3000", "PM-B 18000 MILES", "431422", "428434", "2988"]);
    const parsed = await parseTrackerWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.sheets).toEqual(["PNW DAILY P,M. TRACKER", "T,H,D P.M."]);
    expect(parsed.rows).toEqual([
      { bus: "2779", nextInspType: "A-15", nextInspDue: 428422, transDue: 450000, hubDue: 443182, diffDue: 450000, note: null },
      { bus: "6416", nextInspType: "B-6", nextInspDue: 424636, transDue: null, hubDue: null, diffDue: null, note: null },
      { bus: "6420", nextInspType: null, nextInspDue: null, transDue: null, hubDue: null, diffDue: null, note: "Inspection type not recognized: Oil change" },
      { bus: "6464", nextInspType: null, nextInspDue: null, transDue: 448572, hubDue: null, diffDue: 448572, note: null },
      { bus: "6565", nextInspType: "A-3", nextInspDue: 409751, transDue: null, hubDue: null, diffDue: null, note: null },
    ]);
    expect(parsed.lineCount).toBe(9);
  });
});
