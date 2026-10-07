import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../lib/adminAuth";
import { getFlags, getPmMileage, getPmSettings, recordAuditEvent, updatePmMileage } from "../../lib/store";
import { parseBody, pmDispositionPayloadSchema, pmMileagePatchSchema } from "../../lib/schemas";
import { getMileageSyncStatus } from "../../lib/pmMileageSyncStore";
import { ensureMasterSchedule } from "../../lib/masterSchedule";
import { fleetwatchAutoSyncEnabled } from "../../lib/fleetwatchFlag";

export const dynamic = "force-dynamic";
// The first load after a deploy may apply the committed master schedule.
export const maxDuration = 60;

// Every bus's PM mileage record plus the shared settings (due-soon window).
export async function GET() {
  await ensureMasterSchedule();
  const [records, settings, sync] = await Promise.all([getPmMileage(), getPmSettings(), getMileageSyncStatus()]);
  return NextResponse.json({ records, settings, sync: { ...sync, enabled: fleetwatchAutoSyncEnabled() } });
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
  return NextResponse.json({ ok: true, record, ...(patch.disposition !== undefined ? { flagEntry: (await getFlags())[bus] || null } : {}) });
}

// The crew can change bus status without an admin session. The strict schema
// accepts no mileage, notes, history, or schedule fields.
export async function PATCH(req: Request) {
  const { data, error } = await parseBody(req, pmDispositionPayloadSchema);
  if (error) return error;
  const { bus, disposition, actor } = data;
  const before = (await getPmMileage())[bus] || null;
  const record = await updatePmMileage(bus, { disposition }, actor);
  await recordAuditEvent("pm_mileage_update", { bus, before, after: record }, actor);
  return NextResponse.json({ ok: true, record, flagEntry: (await getFlags())[bus] || null });
}
