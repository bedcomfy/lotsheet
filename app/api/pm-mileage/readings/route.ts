import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { applyPmReadings, recordAuditEvent } from "../../../lib/store";
import { parseBody, pmReadingsPayloadSchema } from "../../../lib/schemas";

export const dynamic = "force-dynamic";

// Apply a reviewed batch of odometer readings (from a PDF import). Admin only:
// one bad batch can rewrite every bus's mileage.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { data, error } = await parseBody(req, pmReadingsPayloadSchema);
  if (error) return error;
  const readings = data.readings.map((r) => ({ bus: r.bus, odometer: r.odometer, readAt: r.readAt ?? null }));
  const result = await applyPmReadings(readings, data.source, data.actor);
  await recordAuditEvent(
    "pm_mileage_import",
    { source: data.source, batch: result.batch, count: result.applied.length, buses: result.applied },
    data.actor,
  );
  return NextResponse.json({ ok: true, ...result });
}
