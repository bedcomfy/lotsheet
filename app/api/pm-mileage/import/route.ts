import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { DEFAULT_MASTER, normalizeBusMaster } from "../../../lib/buses";
import { extractOdometerReadings, PM_EXTRACT_MODEL, pmExtractConfigured } from "../../../lib/pmExtract";
import { parseOdometerReport } from "../../../lib/odometerReport";
import { reviewReadings } from "../../../lib/pmMileage";
import { parsePmReport } from "../../../lib/pmReport";
import { readPdfText } from "../../../lib/pmReportPdf";
import { getPmMileage, getState } from "../../../lib/store";
import type { MasterBus } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the AI fallback on a multi-page scan can take a while

const MAX_PDF_BYTES = 20 * 1024 * 1024;

// Read a fleet report PDF and return what it says about each bus, reviewed
// against the fleet list and the mileage on file. The PDF's own text layer
// is read first — free, instant, and exact for the two reports the garage
// prints: the Total Fleet PM Status Report (inspections due) and the
// Vehicles Monthly Miles to Date Report (odometers). Only a PDF with no
// readable text (a photo-only scan) goes to the AI reader, and only when a
// key is configured. Nothing is saved here; the page shows the review and
// POSTs accepted rows to /readings.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF as `file`." }, { status: 400 });
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) return NextResponse.json({ error: "Only PDF files can be scanned." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "That PDF is over 20 MB." }, { status: 413 });
  const pdf = Buffer.from(await file.arrayBuffer());

  const masterValue = (await getState("bus_master")).value as { buses?: unknown } | null;
  const fleet = normalizeBusMaster(
    masterValue && Array.isArray(masterValue.buses) ? (masterValue as { buses: MasterBus[] }) : DEFAULT_MASTER,
  ).buses;
  const current = await getPmMileage();

  // 1. The text layer: the PM status report, else the monthly miles report.
  let textLines = 0;
  try {
    const pages = await readPdfText(pdf);
    const pm = parsePmReport(pages);
    textLines = pm.lineCount;
    if (pm.buses.length) {
      const review = reviewReadings(
        pm.buses.map((b) => ({
          bus: b.bus,
          odometer: b.odometer,
          readAt: pm.reportDate,
          note: b.note,
          nextInspType: b.nextInspType,
          nextInspDue: b.nextInspDue,
          lastInspType: b.lastInspType,
          lastInspMiles: b.lastInspMiles,
          transDue: b.transDue,
          lastTransMiles: b.lastTransMiles,
        })),
        fleet,
        current,
      );
      return NextResponse.json({
        ...review,
        reportDate: pm.reportDate,
        notes: null,
        method: "text",
        format: "pm-status",
        model: null,
        fileName: file.name,
        rawCount: pm.rows.length,
      });
    }
    const od = parseOdometerReport(pages);
    if (od.rows.length) {
      const review = reviewReadings(
        od.rows.map((r) => ({
          bus: r.bus,
          odometer: r.odometer,
          readAt: od.reportDate,
          note: r.notServiced ? "not serviced this period; reading is from its last service" : null,
        })),
        fleet,
        current,
      );
      return NextResponse.json({
        ...review,
        reportDate: od.reportDate,
        notes: null,
        method: "text",
        format: "monthly-miles",
        model: null,
        fileName: file.name,
        rawCount: od.rows.length,
      });
    }
  } catch (err) {
    console.warn("[pm-import] text layer read failed:", err instanceof Error ? err.message : err);
  }

  // 2. The AI reader, for scans with no usable text.
  if (!pmExtractConfigured()) {
    return NextResponse.json(
      {
        error:
          textLines > 0
            ? "This PDF has text, but none of it looks like the PM status report or the monthly miles report. Reading other layouts needs the AI key (ANTHROPIC_API_KEY) on the server."
            : "This PDF has no readable text — it's a picture-only scan. Re-scan with OCR/searchable PDF turned on, or add ANTHROPIC_API_KEY on the server so the AI reader can look at the pages.",
      },
      { status: 422 },
    );
  }
  let extracted;
  try {
    extracted = await extractOdometerReadings(pdf, file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed.";
    return NextResponse.json({ error: `Couldn't read that PDF: ${message}` }, { status: 502 });
  }
  const review = reviewReadings(extracted.readings, fleet, current);
  return NextResponse.json({
    ...review,
    reportDate: extracted.reportDate,
    notes: extracted.notes,
    method: "ai",
    format: "ai",
    model: PM_EXTRACT_MODEL,
    fileName: file.name,
    rawCount: extracted.readings.length,
  });
}
