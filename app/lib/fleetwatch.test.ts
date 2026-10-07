import { afterEach, describe, expect, it, vi } from "vitest";
import { fleetwatchReportUrl, parseFleetwatchReport } from "./fleetwatch";
import { downloadFleetwatchReport } from "./fleetwatchSync";
import type { PositionedText } from "./pmReport";

function page(lines: string[]): PositionedText[] {
  return lines.map((text, i) => ({ text, x: 10, y: 800 - i * 20, dirX: 1, dirY: 0 }));
}

afterEach(() => vi.unstubAllGlobals());

describe("Fleetwatch report", () => {
  it.each([
    ["2026-10-01T05:05:42Z", "09/30/2026 12:05 AM", "10/01/2026 12:05 AM"],
    ["2026-03-08T08:30:00Z", "03/07/2026 02:30 AM", "03/08/2026 03:30 AM"],
    ["2026-11-01T08:30:00Z", "10/31/2026 03:30 AM", "11/01/2026 02:30 AM"],
  ])("uses a real 24-hour Chicago window at %s", (now, start, end) => {
    const url = fleetwatchReportUrl(new Date(now));
    expect(url.searchParams.get("StartDate")).toBe(start);
    expect(url.searchParams.get("EndDate")).toBe(end);
    expect(url.searchParams.get("Division")).toBe("0043");
    expect(url.searchParams.get("reportFormat")).toBe("pdf");
  });

  it("rejects another period or division and keeps last-service semantics", () => {
    const url = fleetwatchReportUrl(new Date("2026-09-30T09:55:00Z"));
    const header = ["Vehicles Monthly Miles to Date Report (with last odometer)",
      "Report between 09/29/2026 04:55 AM and 09/30/2026 04:55 AM"];
    const row = "006404 0043 123456.7 * 5.6 * 0.0 0.0 0.0 0.0 0.0";
    expect(parseFleetwatchReport([page([...header, row])], url).rows[0]).toMatchObject({ bus: "6404", odometer: 123456.7, notServiced: true });
    expect(() => parseFleetwatchReport([page([...header, row.replace("0043", "0044")])], url)).toThrow("division");
    expect(() => parseFleetwatchReport([page([...header, row])], fleetwatchReportUrl(new Date("2026-09-30T10:55:00Z")))).toThrow("date range");
    expect(() => parseFleetwatchReport([page(header)], url)).toThrow("no usable readings");
  });

  it("rejects login HTML, invalid PDF bytes, oversized responses, and HTTP errors", async () => {
    for (const response of [
      new Response("login", { headers: { "content-type": "text/html" } }),
      new Response("not a PDF", { headers: { "content-type": "application/pdf" } }),
      new Response(new Uint8Array(4 * 1024 * 1024 + 1), { headers: { "content-type": "application/pdf" } }),
      new Response("error", { status: 503 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(downloadFleetwatchReport(fleetwatchReportUrl())).rejects.toThrow("Fleetwatch");
    }
  });
});
