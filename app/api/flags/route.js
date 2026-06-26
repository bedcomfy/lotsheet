import { NextResponse } from "next/server";
import { getFlags, setBusFlags } from "../../lib/store";

export const dynamic = "force-dynamic";

// Public: anyone can read the flags so they auto-populate on the sheet.
export async function GET() {
  const flags = await getFlags();
  return NextResponse.json({ flags });
}

// Set a bus's full list of flags (empty clears it). Sheets are global and saved
// on the website, so there's no separate manager password.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const bus = String(body.bus || "").trim();
  if (!bus) {
    return NextResponse.json({ error: "Missing bus" }, { status: 400 });
  }
  const flags = Array.isArray(body.flags) ? body.flags : [];
  const note = typeof body.note === "string" ? body.note : "";
  const inspMiles =
    body.inspMiles === null || body.inspMiles === undefined || body.inspMiles === ""
      ? null
      : body.inspMiles;
  const holdReason = typeof body.holdReason === "string" ? body.holdReason : "";
  const retorqueTires = Array.isArray(body.retorqueTires) ? body.retorqueTires : [];
  const inspOption = typeof body.inspOption === "string" ? body.inspOption : "";
  await setBusFlags(bus, { flags, note, inspMiles, holdReason, retorqueTires, inspOption });
  return NextResponse.json({ ok: true });
}
