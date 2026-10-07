import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { DEFAULT_MASTER, normalizeBusMaster } from "../../../lib/buses";
import { extractOdometerReadings, PM_EXTRACT_MODEL, pmExtractConfigured } from "../../../lib/pmExtract";
import { parseOdometerReport } from "../../../lib/odometerReport";
import { parseVehicleListReport } from "../../../lib/vehicleListReport";
import { parseTrackerWorkbook, trackerScheduleReadings } from "../../../lib/pmTracker";
import { isPmFleetBus } from "../../../lib/pmMileage";
import { reviewReadings } from "../../../lib/pmMileage";
import { parsePmReport, type PositionedText } from "../../../lib/pmReport";
import { readPdfText } from "../../../lib/pmReportPdf";
import { getPmMileage, getState } from "../../../lib/store";
import type { MasterBus } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the AI fallback on a multi-page scan can take a while

const MAX_PDF_BYTES = 4 * 1024 * 1024; // a serverless request carries ~4.5 MB; bigger scans are read in the browser
const MAX_TEXT_ITEMS = 200_000;

// The browser sends the PDF's positioned text when the file is too big to
// upload: { fileName, pages: [[{ text, x, y, dirX, dirY }]] }.
function pagesFromJson(body: unknown): { fileName: string; pages: PositionedText[][] } | null {
  const b = body as { fileName?: unknown; pages?: unknown } | null;
  if (!b || !Array.isArray(b.pages)) return null;
  let count = 0;
  const pages: PositionedText[][] = [];
  for (const page of b.pages) {
    if (!Array.isArray(page)) return null;
    const items: PositionedText[] = [];
    for (const it of page) {
      const o = it as { text?: unknown; x?: unknown; y?: unknown; dirX?: unknown; dirY?: unknown };
      if (typeof o?.text !== "string") continue;
      const nums = [o.x, o.y, o.dirX, o.dirY].map(Number);
      if (nums.some((n) => !Number.isFinite(n))) continue;
      items.push({ text: o.text, x: nums[0], y: nums[1], dirX: nums[2], dirY: nums[3] });
      count += 1;
      if (count > MAX_TEXT_ITEMS) return null;
    }
    pages.push(items);
  }
  return { fileName: typeof b.fileName === "string" && b.fileName.trim() ? b.fileName.trim() : "report.pdf", pages };
}

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
  let pdf: Buffer | null = null;
  let pagesFromClient: PositionedText[][] | null = null;
  let fileName = "report.pdf";
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const parsed = pagesFromJson(await req.json().catch(() => null));
    if (!parsed) return NextResponse.json({ error: "Send { fileName, pages } with the PDF's positioned text." }, { status: 400 });
    pagesFromClient = parsed.pages;
    fileName = parsed.fileName;
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF or the tracker workbook as `file`." }, { status: 400 });
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "That file is too big to upload whole; a PDF is read in the browser instead." }, { status: 413 });
    }
    const isWorkbook = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
    if (isWorkbook) return importTracker(Buffer.from(await file.arrayBuffer()), file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) return NextResponse.json({ error: "Only PDF files and the tracker workbook (.xlsx) can be read." }, { status: 400 });
    pdf = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
  }

  const masterValue = (await getState("bus_master")).value as { buses?: unknown } | null;
  const fleet = normalizeBusMaster(
    masterValue && Array.isArray(masterValue.buses) ? (masterValue as { buses: MasterBus[] }) : DEFAULT_MASTER,
  ).buses;
  const current = await getPmMileage();

  // 1. The text layer: the PM status report, else the monthly miles report.
  let textLines = 0;
  try {
    const pages = pagesFromClient ?? (await readPdfText(pdf as Buffer));
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
          hubDue: b.hubDue,
          lastHubMiles: b.lastHubMiles,
          diffDue: b.diffDue,
          lastDiffMiles: b.lastDiffMiles,
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
        fileName,
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
        fileName,
        rawCount: od.rows.length,
      });
    }
    // 3. The Vehicle List Report (Detail): current odometer per vehicle, no
    // date window. The same report "Force Update" fetches on its own.
    const vl = parseVehicleListReport(pages);
    if (vl.rows.length) {
      const review = reviewReadings(
        vl.rows.map((r) => ({ bus: r.bus, odometer: r.odometer, readAt: r.readAt ?? vl.reportDate, note: null })),
        fleet,
        current,
      );
      return NextResponse.json({
        ...review,
        reportDate: vl.reportDate,
        notes: null,
        method: "text",
        format: "vehicle-list",
        model: null,
        fileName,
        rawCount: vl.rows.length,
      });
    }
  } catch (err) {
    console.warn("[pm-import] text layer read failed:", err instanceof Error ? err.message : err);
  }

  // 2. The AI reader, for scans with no usable text. It needs the PDF itself,
  // which a text-only (browser-read) request doesn't carry.
  if (!pdf) {
    return NextResponse.json(
      {
        error:
          textLines > 0
            ? "This PDF has text, but none of it looks like the PM status report or the monthly miles report."
            : "This PDF has no readable text — it's a picture-only scan. Re-scan with OCR/searchable PDF turned on.",
      },
      { status: 422 },
    );
  }
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
    extracted = await extractOdometerReadings(pdf, fileName);
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
    fileName,
    rawCount: extracted.readings.length,
  });
}

// The shop's "PNW DAILY P.M. TRACKER" workbook: which inspection is due next
// and the trans PM mark for every bus. It carries no fresh mileage, so the
// review shows the odometer already on file and applying changes only the
// schedule. Active buses the workbook leaves out are listed so the shop can
// add them.
async function importTracker(file: Buffer, fileName: string) {
  const masterValue = (await getState("bus_master")).value as { buses?: unknown } | null;
  const fleet = normalizeBusMaster(
    masterValue && Array.isArray(masterValue.buses) ? (masterValue as { buses: MasterBus[] }) : DEFAULT_MASTER,
  ).buses;
  const current = await getPmMileage();
  let parsed;
  try {
    parsed = await parseTrackerWorkbook(file);
  } catch (err) {
    console.warn("[pm-import] tracker workbook read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't read that workbook. Save it as .xlsx and try again." }, { status: 422 });
  }
  if (!parsed.sheets.length) {
    return NextResponse.json({ error: "No tracker sheet found: expected Bus #, Inspection Due and Next Insp Type (or PM Schedule) columns with a live miles formula." }, { status: 422 });
  }
  const review = reviewReadings(
    trackerScheduleReadings(parsed.rows),
    fleet,
    current,
  );
  const listed = new Set(parsed.rows.map((row) => row.bus));
  const missingFromTracker = fleet.filter(isPmFleetBus).map((bus) => bus.num).filter((num) => !listed.has(num))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return NextResponse.json({
    ...review,
    reportDate: null,
    notes: `Read from ${parsed.sheets.join(" and ")}. The tracker sets each bus's next inspection and its trans, hub and diff PM marks; odometers stay as they are on this page.`,
    method: "text",
    format: "tracker",
    model: null,
    fileName,
    rawCount: parsed.rows.length,
    missingFromTracker,
  });
}
