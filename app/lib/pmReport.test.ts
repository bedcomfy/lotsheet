import { describe, expect, it } from "vitest";
import { linesFromText, parsePmReport, parseReportLine, reportDateFromText, summarizeReportRows } from "./pmReport";

describe("parseReportLine", () => {
  it("reads an inspection line", () => {
    const row = parseReportLine("2779 3,012 -12 PM-A 15000 MILES 2119994 428,434 428,422", 1);
    expect(row).toMatchObject({ bus: "2779", milesSince: 3012, milesUntil: -12, interval: 3000, mark: 15000, workOrder: "2119994", current: 428434, dueAt: 428422 });
  });

  it("reads a trans PM line and its fluid-change companions", () => {
    expect(parseReportLine("6512 74,800 200 TRANS P.M. 75000 2120668 449,871 450,071")).toMatchObject({ interval: 75000, mark: null, dueAt: 450071 });
    expect(parseReportLine("6409 74,266 734 CHANGE DIFFERENTIAL 2120030 449,003 449,737")).toMatchObject({ interval: 75000, mark: null });
    expect(parseReportLine("6409 74,266 734 CHANGE FRONT HUB FLUID 2120031 449,003 449,737")).toMatchObject({ interval: 75000 });
  });

  it("survives the usual OCR slips and a missing work order", () => {
    expect(parseReportLine("6394 2,796 204 PM-B 6000 Ml LES 2120048 473,585 473,789")?.mark).toBe(6000);
    expect(parseReportLine("6432 1,270 1,730 PM-8 12000 MILES 2120193 478,129 479,859")?.mark).toBe(12000);
    expect(parseReportLine("6470 2,331 669 PM-B 12000 MILES 453,810 454,479")).toMatchObject({ workOrder: null, dueAt: 454479 });
    expect(parseReportLine("~~.-::·;~ ~ ~~9 406 2,594 PM-C 24000 MILES 2120161 465,221 467,815")).toBeNull();
  });

  it("rejects lines whose numbers don't add up", () => {
    expect(parseReportLine("2779 3,012 -12 PM-A 15000 MILES 2119994 428,434 428,432")).toBeNull(); // due ≠ current + until
    expect(parseReportLine("2779 3,912 -12 PM-A 15000 MILES 2119994 428,434 428,422")).toBeNull(); // interval ≠ 3,000
    expect(parseReportLine("2779 3,012 -12 PM-A 16000 MILES 2119994 428,434 428,422")).toBeNull(); // no such mark
    expect(parseReportLine("Asset Number Miles Since Last Inspection")).toBeNull();
  });
});

describe("summarizeReportRows", () => {
  it("collapses duplicate work orders and derives last/next from the cycle", () => {
    const rows = [
      parseReportLine("2779 3,012 -12 PM-A 15000 MILES 2119994 428,434 428,422"),
      parseReportLine("2779 3,012 -12 PM-A 15000 MILES 2120014 428,434 428,422"),
      parseReportLine("6512 74,800 200 TRANS P.M. 75000 2120668 449,871 450,071"),
      parseReportLine("6512 74,800 200 CHANGE FRONT HUB 2120667 449,871 450,071"),
      parseReportLine("6512 2,500 500 PM-A 3000 MILES 2120600 449,871 450,371"),
    ].filter((r) => r !== null);
    const buses = summarizeReportRows(rows);
    expect(buses.map((b) => b.bus)).toEqual(["2779", "6512"]);
    expect(buses[0]).toMatchObject({ odometer: 428434, nextInspType: "A-15", nextInspDue: 428422, lastInspType: "B-12", lastInspMiles: 425422, transDue: null, note: null });
    expect(buses[1]).toMatchObject({ odometer: 449871, nextInspType: "A-3", lastInspType: "C-24", lastInspMiles: 447371, transDue: 450071, lastTransMiles: 375071 });
  });

  it("keeps the highest mileage when rows disagree and says so", () => {
    const rows = [
      parseReportLine("6400 1,000 2,000 PM-B 6000 MILES 2120001 400,000 402,000"),
      parseReportLine("6400 1,100 1,900 PM-B 6000 MILES 2120002 400,100 402,000"),
    ].filter((r) => r !== null);
    const [bus] = summarizeReportRows(rows);
    expect(bus.odometer).toBe(400100);
    expect(bus.note).toMatch(/disagree/);
  });

  it("does not discard a transmission schedule when its line has an older odometer", () => {
    const rows = [
      parseReportLine("6417 2,975 25 PM-A 3000 MILES 2120110 100,000 100,025"),
      parseReportLine("6417 74,740 260 TRANS P.M. 75000 2120111 99,990 100,250"),
    ].filter((row) => row !== null);
    expect(summarizeReportRows(rows)[0]).toMatchObject({ odometer: 100_000, nextInspType: "A-3", nextInspDue: 100_025, transDue: 100_250 });
  });
});

describe("linesFromText / parsePmReport", () => {
  it("rebuilds lines from text rotated 90° and reads the header date", () => {
    // Rotated page: reading direction is -y, rows stack along x.
    const line = (x: number, words: string[]) =>
      words.map((text, i) => ({ text, x, y: 700 - i * 60, dirX: 0, dirY: -1 }));
    const items = [
      ...line(500, ["Total Fleet PM Status Report", "30/SEP/2026"]),
      ...line(430, ["2779", "3,012", "-12", "PM-A 15000 MILES", "2119994", "428,434", "428,422"]),
      ...line(417, ["6417", "2,939", "61", "PM-A 3000 MILES", "2120110", "472,543", "472,604"]),
    ];
    const lines = linesFromText(items);
    expect(lines[0]).toBe("Total Fleet PM Status Report 30/SEP/2026");
    const parsed = parsePmReport([items]);
    expect(parsed.reportDate).toBe("9/30/26");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.buses[1]).toMatchObject({ bus: "6417", nextInspType: "A-3", lastInspType: "C-24" });
  });

  it("formats report dates", () => {
    expect(reportDateFromText("report 05/JAN/2027 x")).toBe("1/5/27");
    expect(reportDateFromText("nothing")).toBeNull();
  });
});
