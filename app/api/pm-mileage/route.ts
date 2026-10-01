import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../lib/adminAuth";
import { getPmMileage, getPmSettings, recordAuditEvent, updatePmMileage } from "../../lib/store";
import { parseBody, pmMileagePatchSchema } from "../../lib/schemas";

export const dynamic = "force-dynamic";

// Every bus's PM mileage record plus the shared settings (due-soon window).
export async function GET() {
  const [records, settings] = await Promise.all([getPmMileage(), getPmSettings()]);
  return NextResponse.json({ records, settings });
}

// Edit one bus: odometer and its date, last inspection (type/miles/date), last
// transmission PM (miles/date), status, note. Intervals are fixed, never
// edited. Only the fields sent change. Admin only: the PM list is the
// garage's schedule, so every edit needs Admin Tools unlocked.
export async function PUT(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { data, error } = await parseBody(req, pmMileagePatchSchema);
  if (error) return error;
  const { bus, actor, ...patch } = data;
  const before = (await getPmMileage())[bus] || null;
  const record = await updatePmMileage(bus, patch, actor);
  await recordAuditEvent("pm_mileage_update", { bus, before, after: record }, actor);
  return NextResponse.json({ ok: true, record });
}
