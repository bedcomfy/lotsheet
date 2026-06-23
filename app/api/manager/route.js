import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Verify the manager password so the UI can unlock manager mode.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const expected = process.env.MANAGER_PASSWORD || "manager";
  return NextResponse.json({ ok: body.password === expected });
}
