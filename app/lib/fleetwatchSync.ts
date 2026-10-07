import { fleetwatchReportUrl, fleetwatchServiceReportUrl, fleetwatchVehicleListUrl, parseFleetwatchReport, parseFleetwatchVehicleList } from "./fleetwatch";
import { parseVehicleServiceReport } from "./vehicleServiceReport";
import { readPdfText } from "./pmReportPdf";
import { claimMileageSync, finishMileageSync } from "./pmMileageSyncStore";
import { chicagoDateShort } from "./chicagoTime";
import type { OdometerReportParse } from "./odometerReport";

const MAX_BYTES = 4 * 1024 * 1024;

export async function downloadFleetwatchReport(url: URL): Promise<Buffer> {
  const response = await fetch(url, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000),
    headers: { Accept: "application/pdf" },
  });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/pdf") || !response.body) {
    await response.body?.cancel();
    throw new Error("Fleetwatch did not return a PDF. Try again shortly.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Fleetwatch's report is too large to import automatically.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const pdf = Buffer.concat(chunks);
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Fleetwatch returned an unreadable PDF.");
  return pdf;
}

export async function syncFleetwatchMileage() {
  const now = new Date();
  const claim = await claimMileageSync(now);
  if (!claim.claimed) return { ok: claim.running || !claim.status.error, error: claim.running ? undefined : claim.status.error, busy: claim.running, cooldown: !claim.running, status: claim.status };
  const url = fleetwatchReportUrl(now);
  try {
    const [mileage, service] = await Promise.allSettled([
      downloadFleetwatchReport(url).then(readPdfText).then((pages) => parseFleetwatchReport(pages, url)),
      downloadFleetwatchReport(fleetwatchServiceReportUrl(now)).then(readPdfText).then(parseVehicleServiceReport),
    ]);
    if (mileage.status === "rejected") throw mileage.reason;
    if (service.status === "rejected") console.error("Fleetwatch service-time update failed", service.reason);
    const status = await finishMileageSync(claim.token, {
      report: mileage.value, services: service.status === "fulfilled" ? service.value : [],
      serviceError: service.status === "rejected" ? "Mileage checked, but Fleetwatch service times couldn't be refreshed. Previous service times were kept; try again shortly." : null,
      windowStart: url.searchParams.get("StartDate")!, windowEnd: url.searchParams.get("EndDate")!,
    });
    return { ok: true, status };
  } catch (error) {
    console.error("Fleetwatch mileage sync failed", error);
    const message = error instanceof Error && error.message.startsWith("Fleetwatch")
      ? error.message : "Couldn't update mileage from Fleetwatch. Saved mileage is unchanged; try again shortly.";
    const status = await finishMileageSync(claim.token, { error: message });
    return { ok: false, error: message, status };
  }
}

// "Force Update" on PM Mileage: read the always-current Vehicle List Report
// and apply its odometers with the same lease, guards and history as the
// scheduled update. Independent of the FLEETWATCH_AUTO_SYNC switch; the
// route that calls it requires Admin Tools.
export async function syncFleetwatchVehicleList() {
  const now = new Date();
  const claim = await claimMileageSync(now);
  if (!claim.claimed) return { ok: claim.running || !claim.status.error, error: claim.running ? undefined : claim.status.error, busy: claim.running, cooldown: !claim.running, status: claim.status };
  try {
    const parsed = await downloadFleetwatchReport(fleetwatchVehicleListUrl()).then(readPdfText).then(parseFleetwatchVehicleList);
    const report: OdometerReportParse = {
      rows: parsed.rows.map((row) => ({ bus: row.bus, division: "0043", dept: null, odometer: row.odometer, mpg: null, milesRun: null, notServiced: false, page: row.page })),
      reportDate: parsed.reportDate ?? chicagoDateShort(now),
      lineCount: parsed.lineCount,
    };
    const stamp = now.toISOString();
    const status = await finishMileageSync(claim.token, { report, services: [], serviceError: null, windowStart: stamp, windowEnd: stamp, actor: "Force Update" });
    return { ok: true, status, rows: report.rows.length };
  } catch (error) {
    console.error("Fleetwatch Force Update failed", error);
    const message = error instanceof Error && error.message.startsWith("Fleetwatch")
      ? error.message : "Couldn't update mileage from Fleetwatch. Saved mileage is unchanged; try again shortly.";
    const status = await finishMileageSync(claim.token, { error: message });
    return { ok: false, error: message, status };
  }
}
