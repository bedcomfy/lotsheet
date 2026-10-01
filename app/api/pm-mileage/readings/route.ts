import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { applyPmReadings, recordAuditEvent } from "../../../lib/store";
import { parseBody, pmReadingsPayloadSchema } from "../../../lib/schemas";
import { isInspectionType } from "../../../lib/pmMileage";

export const dynamic = "force-dynamic";

// Apply a reviewed batch of readings (from a PDF import): odometer, and when
// the report said so, the last inspection and trans PM. Admin only: one bad
// batch can rewrite every bus's mileage.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { data, error } = await parseBody(req, pmReadingsPayloadSchema);
  if (error) return error;
  const readings = data.readings.map((r) => ({
    bus: r.bus,
    odometer: r.odometer,
    readAt: r.readAt ?? null,
    nextInspType: r.nextInspType ?? null,
    nextInspDue: r.nextInspDue ?? null,
    transDue: r.transDue ?? null,
    lastInspType: isInspectionType(r.lastInspType) ? r.lastInspType : null,
    lastInspMiles: r.lastInspMiles ?? null,
    lastTransMiles: r.lastTransMiles ?? null,
  }));
  const result = await applyPmReadings(readings, data.source, data.actor);
  await recordAuditEvent(
    "pm_mileage_import",
    { source: data.source, batch: result.batch, count: result.applied.length, buses: result.applied },
    data.actor,
  );
  return NextResponse.json({ ok: true, ...result });
}
