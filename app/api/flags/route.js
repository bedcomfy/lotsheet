import { NextResponse } from "next/server";
import { getFlags, setBusFlags } from "../../lib/store";

export const dynamic = "force-dynamic";

function isManager(password) {
  const expected = process.env.MANAGER_PASSWORD || "manager";
  return !!password && password === expected;
}

// Public: anyone can read the flags so they auto-populate on the sheet.
export async function GET() {
  const flags = await getFlags();
  return NextResponse.json({ flags });
}

// Manager only: set a bus's full list of flags (empty array clears it).
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isManager(body.password)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bus = String(body.bus || "").trim();
  if (!bus) {
    return NextResponse.json({ error: "Missing bus" }, { status: 400 });
  }
  const flags = Array.isArray(body.flags) ? body.flags : [];
  const note = typeof body.note === "string" ? body.note : "";
  await setBusFlags(bus, { flags, note });
  return NextResponse.json({ ok: true });
}
