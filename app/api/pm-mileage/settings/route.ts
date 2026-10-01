import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { getPmSettings, recordAuditEvent, setPmSettings } from "../../../lib/store";
import { parseBody, pmSettingsPayloadSchema } from "../../../lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: await getPmSettings() });
}

// The fleet-wide "due soon" threshold. Admin only. (PM intervals are fixed by
// the inspection cycle and the 75,000-mile transmission PM — not a setting.)
export async function PUT(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { data, error } = await parseBody(req, pmSettingsPayloadSchema);
  if (error) return error;
  const before = await getPmSettings();
  const settings = await setPmSettings({ ...before, ...data });
  await recordAuditEvent("pm_settings_update", { before, after: settings }, data.actor);
  return NextResponse.json({ ok: true, settings });
}
