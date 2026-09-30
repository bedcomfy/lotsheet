import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { DEFAULT_MASTER, normalizeBusMaster } from "../../../lib/buses";
import { extractOdometerReadings, PM_EXTRACT_MODEL, pmExtractConfigured } from "../../../lib/pmExtract";
import { reviewReadings } from "../../../lib/pmMileage";
import { getPmMileage, getState } from "../../../lib/store";
import type { MasterBus } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // reading a multi-page scan can take a while

const MAX_PDF_BYTES = 20 * 1024 * 1024;

// Scan a mileage report PDF and return the readings it contains, reviewed
// against the fleet list and the mileage on file. Nothing is saved here —
// the page shows the review and POSTs the accepted rows to /readings.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  if (!pmExtractConfigured()) {
    return NextResponse.json(
      { error: "PDF scanning isn't set up on this server. Add ANTHROPIC_API_KEY to the environment." },
      { status: 503 },
    );
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF as `file`." }, { status: 400 });
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return NextResponse.json({ error: "Only PDF files can be scanned." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "That PDF is over 20 MB." }, { status: 413 });

  const pdf = Buffer.from(await file.arrayBuffer());
  let extracted;
  try {
    extracted = await extractOdometerReadings(pdf, file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed.";
    return NextResponse.json({ error: `Couldn't read that PDF: ${message}` }, { status: 502 });
  }

  const masterValue = (await getState("bus_master")).value as { buses?: unknown } | null;
  const fleet = normalizeBusMaster(
    masterValue && Array.isArray(masterValue.buses) ? (masterValue as { buses: MasterBus[] }) : DEFAULT_MASTER,
  ).buses;
  const current = await getPmMileage();
  const review = reviewReadings(extracted.readings, fleet, current);
  return NextResponse.json({
    ...review,
    reportDate: extracted.reportDate,
    notes: extracted.notes,
    model: PM_EXTRACT_MODEL,
    fileName: file.name,
    rawCount: extracted.readings.length,
  });
}
