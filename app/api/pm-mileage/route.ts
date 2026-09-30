import { NextResponse } from "next/server";
import { getPmMileage, getPmSettings, recordAuditEvent, updatePmMileage } from "../../lib/store";
import { parseBody, pmMileagePatchSchema } from "../../lib/schemas";

export const dynamic = "force-dynamic";

// Every bus's PM mileage record plus the shared settings (default interval).
export async function GET() {
  const [records, settings] = await Promise.all([getPmMileage(), getPmSettings()]);
  return NextResponse.json({ records, settings });
}

// Edit one bus: odometer, its date, last PM mark, interval override, note.
// Only the fields sent change. Like flags, no password — it's crew data.
export async function PUT(req: Request) {
  const { data, error } = await parseBody(req, pmMileagePatchSchema);
  if (error) return error;
  const { bus, actor, ...patch } = data;
  const before = (await getPmMileage())[bus] || null;
  const record = await updatePmMileage(bus, patch, actor);
  await recordAuditEvent("pm_mileage_update", { bus, before, after: record }, actor);
  return NextResponse.json({ ok: true, record });
}
