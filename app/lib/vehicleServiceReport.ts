import { linesFromText, type PositionedText } from "./pmReport";

export interface VehicleServiceReading {
  bus: string;
  division: string;
  odometer: number;
  // Fleetwatch's Chicago wall-clock time, to the second. The report supplies
  // no UTC offset, so preserve it without inventing one at a DST transition.
  servicedAt: string; // YYYY-MM-DDTHH:mm:ss
}

const DATE_TIME = "(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}:\\d{2}:\\d{2})\\s+(AM|PM)";
const SERVICED = new RegExp(`^(\\d{4,7})\\s+(\\d{3,5})\\s+${DATE_TIME}\\s+\\d{3,5}\\s+\\d+\\.\\d\\s+(\\d+\\.\\d)(?:\\s|$)`);
const NOT_SERVICED = new RegExp(`^(\\d{4,7})\\s+(\\d{3,5})\\s+(\\d+\\.\\d)\\s+${DATE_TIME}(?:\\s|$)`);

export function serviceTimestamp(date: string, time: string, ampm: string): string | null {
  const [month, day, year] = date.split("/").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour < 1 || hour > 12 || minute > 59 || second > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour % 12 + (ampm === "PM" ? 12 : 0))}:${pad(minute)}:${pad(second)}`;
}

export function parseVehicleServiceLine(line: string): VehicleServiceReading | null {
  const serviced = SERVICED.exec(line.trim());
  const idle = serviced ? null : NOT_SERVICED.exec(line.trim());
  if (!serviced && !idle) return null;
  const [bus, division, miles, date, time, ampm] = serviced
    ? [serviced[1], serviced[2], serviced[6], serviced[3], serviced[4], serviced[5]]
    : [idle![1], idle![2], idle![3], idle![4], idle![5], idle![6]];
  const servicedAt = serviceTimestamp(date, time, ampm);
  const odometer = Math.round(Number(miles));
  if (!servicedAt || !Number.isSafeInteger(odometer) || odometer <= 0) return null;
  return { bus: bus.replace(/^0+/, ""), division, odometer, servicedAt };
}

export function parseVehicleServiceReport(pages: PositionedText[][]): VehicleServiceReading[] {
  const lines = pages.flatMap(linesFromText);
  const text = lines.join("\n");
  // This report does not print the requested dates. Validate its title,
  // division, and transaction column; each saved timestamp is also matched
  // against the separately validated odometer report in the same update.
  if (!text.includes("Vehicle Service Status Report") || !text.includes("Division 0043") || !text.includes("Transaction Odometer")) {
    throw new Error("Fleetwatch returned an unexpected service report. Last-service times were kept.");
  }
  const latest = new Map<string, VehicleServiceReading>();
  for (const line of lines) {
    const row = parseVehicleServiceLine(line);
    if (!row) continue;
    if (row.division !== "0043") throw new Error("Fleetwatch returned service readings from another division. Last-service times were kept.");
    const previous = latest.get(row.bus);
    if (!previous || row.servicedAt > previous.servicedAt || (row.servicedAt === previous.servicedAt && row.odometer > previous.odometer)) latest.set(row.bus, row);
  }
  if (!latest.size) throw new Error("Fleetwatch returned no usable service times. Last-service times were kept.");
  return [...latest.values()];
}

// Format as report-local time, independent of the viewer's device timezone.
export function serviceTimeParts(value: string | null | undefined): { date: string; time: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const h = Number(hour);
  return { date: `${Number(month)}/${Number(day)}/${year.slice(-2)}`, time: `${h % 12 || 12}:${minute}:${second} ${h >= 12 ? "PM" : "AM"}` };
}
