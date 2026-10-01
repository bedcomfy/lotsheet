import { chicagoParts } from "./chicagoTime";
import { parseOdometerReport } from "./odometerReport";
import { linesFromText, type PositionedText } from "./pmReport";

export const FLEETWATCH_INTERVAL_MINUTES = 30;
export const FLEETWATCH_SOURCE = "Fleetwatch · Division 0043";

export interface MileageSyncStatus {
  startedAt?: string;
  runningUntil?: string | null;
  finishedAt?: string;
  lastSuccessAt?: string;
  windowStart?: string;
  windowEnd?: string;
  updated?: number;
  unchanged?: number;
  serviceUpdated?: number;
  serviceError?: string | null;
  skipped?: Array<{ bus: string; reason: string }>;
  error?: string | null;
}

export function fleetwatchDate(date: Date): string {
  const p = chicagoParts(date);
  const hour = Number(p.hour24);
  return `${p.month}/${p.day}/${p.year} ${String(hour % 12 || 12).padStart(2, "0")}:${p.minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export function fleetwatchReportUrl(now = new Date()): URL {
  const end = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const start = new Date(end.getTime() - 24 * 60 * 60_000);
  const url = new URL("https://pace.fleetwatch.com/Main_Reports/reports/Vehicle/Vehicles%20Miles%20to%20Date%20(with%20last%20odometer)/Report.php");
  url.search = new URLSearchParams({
    Fleet: "All", Division: "0043", Department: "All", VehType: "All",
    VehicleList: "All", TotalBy: "Division", Revenue: "Revenue",
    StartDate: fleetwatchDate(start), EndDate: fleetwatchDate(end), reportFormat: "pdf",
  }).toString();
  return url;
}

export function fleetwatchServiceReportUrl(now = new Date()): URL {
  const mileage = fleetwatchReportUrl(now);
  const url = new URL("https://pace.fleetwatch.com/Main_Reports/reports/Vehicle/Vehicle%20Service%20Status%20Report/Report.php");
  url.search = new URLSearchParams({
    Division: "0043", Department: "All", VehType: "All", TotalBy: "Division", Detail: "Detail",
    Revenue: "Revenue", VehicleServiceStatus: "All", StartDate: mileage.searchParams.get("StartDate")!,
    EndDate: mileage.searchParams.get("EndDate")!, reportFormat: "pdf",
  }).toString();
  return url;
}

// A login page, another report, or a cached report for the wrong period must
// never become an automatic mileage import.
export function parseFleetwatchReport(pages: PositionedText[][], url: URL) {
  const text = pages.flatMap(linesFromText).join("\n");
  const period = `between ${url.searchParams.get("StartDate")} and ${url.searchParams.get("EndDate")}`;
  if (!text.includes("Vehicles Monthly Miles to Date Report (with last odometer)") || !text.includes(period)) {
    throw new Error("Fleetwatch returned an unexpected report or date range. No mileage was changed.");
  }
  const report = parseOdometerReport(pages);
  if (!report.rows.length || report.rows.some((row) => row.division !== "0043")) {
    throw new Error("Fleetwatch returned no usable readings for division 0043. No mileage was changed.");
  }
  return report;
}
