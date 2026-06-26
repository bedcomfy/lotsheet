import { NextResponse } from "next/server";
import { getSheet, setSheet } from "../../lib/store";
import type { LotSheet, Lots } from "../../lib/types";

export const dynamic = "force-dynamic";

// Public: anyone can read the shared current sheet so it loads on every device.
export async function GET() {
  const { sheet, updatedAt } = await getSheet();
  return NextResponse.json({ sheet, updatedAt });
}

// Public: save the shared current sheet. Last write wins.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.sheet !== "object" || body.sheet === null) {
    return NextResponse.json({ error: "Missing sheet" }, { status: 400 });
  }
  const updatedAt = await setSheet(body.sheet);
  return NextResponse.json({ ok: true, updatedAt });
}

// Merge ONLY the back-of-sheet lots into the stored sheet, server-side, leaving
// the grid cells (and everything else) untouched. Used by the Turnover sheet so
// it shares the North/East/Fence lots two-way without overwriting the lot grid.
// (Reasons are NOT stored here — a bus's "reason" on the Turnover is its
// universal flags, edited via the flag menu and kept independent of placement.)
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { sheet } = await getSheet();
  const base: LotSheet = (sheet && typeof sheet === "object" ? sheet : {}) as LotSheet;
  const next: LotSheet = { ...base };
  if (body.lots && typeof body.lots === "object") {
    next.lots = { ...(base.lots || {}), ...(body.lots as Lots) };
  }
  const updatedAt = await setSheet(next);
  return NextResponse.json({ ok: true, updatedAt, lots: next.lots || {} });
}
