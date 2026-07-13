import { NextResponse } from "next/server";
import { getFlags, recordAuditEvent, setBusFlags } from "../../lib/store";
import { flagPayloadSchema, parseBody } from "../../lib/schemas";

export const dynamic = "force-dynamic";

// Public: anyone can read the flags so they auto-populate on the sheet.
export async function GET() {
  const flags = await getFlags();
  return NextResponse.json({ flags });
}

// Set a bus's full list of flags (empty clears it). Sheets are global and saved
// on the website, so there's no separate manager password.
export async function POST(req: Request) {
  const { data, error } = await parseBody(req, flagPayloadSchema);
  if (error) return error;
  const { bus, flags, note, holdReason, retorqueTires, inspOption } = data;
  const inspMiles = data.inspMiles ?? null;
  const beforeMap = await getFlags();
  const before = beforeMap[bus] || null;
  const after = { flags, note, inspMiles, holdReason, retorqueTires, inspOption };
  await setBusFlags(bus, after);
  await recordAuditEvent("flag_update", { bus, before, after }, data.actor);
  return NextResponse.json({ ok: true });
}
