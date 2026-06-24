import { NextResponse } from "next/server";
import { getSheet, setSheet } from "../../lib/store";

export const dynamic = "force-dynamic";

// Public: anyone can read the shared current sheet so it loads on every device.
export async function GET() {
  const { sheet, updatedAt } = await getSheet();
  return NextResponse.json({ sheet, updatedAt });
}

// Public: save the shared current sheet. Last write wins.
export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.sheet !== "object" || body.sheet === null) {
    return NextResponse.json({ error: "Missing sheet" }, { status: 400 });
  }
  const updatedAt = await setSheet(body.sheet);
  return NextResponse.json({ ok: true, updatedAt });
}
