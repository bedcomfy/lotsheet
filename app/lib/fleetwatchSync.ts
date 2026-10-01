import { fleetwatchReportUrl, parseFleetwatchReport } from "./fleetwatch";
import { readPdfText } from "./pmReportPdf";
import { claimMileageSync, finishMileageSync } from "./pmMileageSyncStore";

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
    const pdf = await downloadFleetwatchReport(url);
    const report = parseFleetwatchReport(await readPdfText(pdf), url);
    const status = await finishMileageSync(claim.token, {
      report, windowStart: url.searchParams.get("StartDate")!, windowEnd: url.searchParams.get("EndDate")!,
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
