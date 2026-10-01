import { describe, expect, it } from "vitest";
import { parseVehicleServiceLine, parseVehicleServiceReport, serviceTimeParts } from "./vehicleServiceReport";
import { fleetwatchReportUrl, fleetwatchServiceReportUrl } from "./fleetwatch";
import type { PositionedText } from "./pmReport";

const serviced = (date = "09/30/2026 01:20:46 AM", miles = "100010.4") => `006404 0043 ${date} 0043 100000.0 ${miles} 10.4 5.0 2.0 0.0 0.0 0.0 0.0 0.0`;
function page(lines: string[]): PositionedText[] {
  return lines.map((text, i) => ({ text, x: 10, y: 800 - i * 20, dirX: 1, dirY: 0 }));
}

describe("Fleetwatch vehicle service report", () => {
  it("reads transaction odometer rather than previous odometer and preserves seconds", () => {
    expect(parseVehicleServiceLine(serviced())).toEqual({ bus: "6404", division: "0043", odometer: 100010, servicedAt: "2026-09-30T01:20:46" });
    expect(parseVehicleServiceLine(`${serviced()} Unit No Longer Responds To Queries`)).toMatchObject({ odometer: 100010 });
  });
  it("reads older last-service timestamps for vehicles not serviced in the window", () => {
    expect(parseVehicleServiceLine("006435 0043 90000.6 05/12/2026 05:59:15 PM")).toEqual({ bus: "6435", division: "0043", odometer: 90001, servicedAt: "2026-05-12T17:59:15" });
  });
  it("handles noon and midnight without browser timezone conversion", () => {
    expect(parseVehicleServiceLine(serviced("09/30/2026 12:00:01 AM"))?.servicedAt).toBe("2026-09-30T00:00:01");
    expect(parseVehicleServiceLine(serviced("09/30/2026 12:00:01 PM"))?.servicedAt).toBe("2026-09-30T12:00:01");
    expect(serviceTimeParts("2026-09-30T00:00:01")).toEqual({ date: "9/30/26", time: "12:00:01 AM" });
    expect(serviceTimeParts("2026-09-30T12:00:01")).toEqual({ date: "9/30/26", time: "12:00:01 PM" });
    expect(parseVehicleServiceLine(serviced("02/30/2026 01:20:46 AM"))).toBeNull();
  });
  it("keeps the newest transaction across pages even when mileage did not change", () => {
    const rows = parseVehicleServiceReport([
      page(["Vehicle Service Status Report", "Division 0043", "Transaction Odometer", serviced("09/30/2026 02:00:05 AM")]),
      page([serviced(), "006435 0043 90000.6 05/12/2026 05:59:15 PM"]),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].servicedAt).toBe("2026-09-30T02:00:05");
    expect(() => parseVehicleServiceReport([page(["login"])] )).toThrow("unexpected service report");
    expect(() => parseVehicleServiceReport([page(["Vehicle Service Status Report", "Division 0043", "Transaction Odometer", serviced().replace("0043", "0044")])])).toThrow("another division");
  });
  it("uses the same rolling window as the mileage request", () => {
    const now = new Date("2026-11-01T08:30:45Z");
    const miles = fleetwatchReportUrl(now);
    const service = fleetwatchServiceReportUrl(now);
    expect(service.searchParams.get("StartDate")).toBe(miles.searchParams.get("StartDate"));
    expect(service.searchParams.get("EndDate")).toBe(miles.searchParams.get("EndDate"));
    expect(service.searchParams.get("VehicleServiceStatus")).toBe("All");
    expect(service.searchParams.get("Detail")).toBe("Detail");
  });
});
