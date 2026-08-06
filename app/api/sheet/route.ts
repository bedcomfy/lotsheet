import { NextResponse } from "next/server";
import { applySheetOps, getSheet } from "../../lib/store";
import { diffLotSheetOps, type LotSheetOp } from "../../lib/lotSheetOps";
import type { LotKey, LotSheet, Lots } from "../../lib/types";

export const dynamic = "force-dynamic";

// Public: anyone can read the shared current sheet so it loads on every device.
export async function GET() {
  const { sheet, updatedAt, revision } = await getSheet();
  return NextResponse.json({ sheet, updatedAt, revision });
}

// Public: save the shared current sheet. Modern clients send the last sheet
// they saw as `baseSheet`; the server merges only what they changed into the
// current server sheet so simultaneous users do not overwrite each other.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.sheet !== "object" || body.sheet === null) {
    return NextResponse.json({ error: "Missing sheet" }, { status: 400 });
  }
  const incoming = body.sheet as LotSheet;
  const ops: LotSheetOp[] = body.force === true
    ? [{ type: "replace_sheet", sheet: incoming }]
    : diffLotSheetOps(body.baseSheet as LotSheet | null, incoming);
  const result = await applySheetOps(ops, typeof body.actor === "string" ? body.actor : "");
  return NextResponse.json({ ok: true, ...result });
}

// Merge ONLY the back-of-sheet lots into the stored sheet, server-side, leaving
// the grid cells (and everything else) untouched. Used by the Turnover and Shop
// pages so they share the lots two-way without overwriting the lot grid.
// (Reasons are NOT stored here — a bus's "reason" on the Turnover is its
// universal flags, edited via the flag menu and kept independent of placement.)
//
// `clearBuses` (optional) removes those buses from EVERYWHERE — every grid cell
// and every lot (positional lots keep their slot, blanked) — applied BEFORE the
// lots merge. Powers "Move it here" from pages that don't own the grid cells.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ops: LotSheetOp[] = [];
  if (Array.isArray(body.clearBuses) && body.clearBuses.length) {
    for (const bus of body.clearBuses) {
      if (typeof bus === "string" && bus) ops.push({ type: "remove_bus", bus });
    }
  }
  if (Array.isArray(body.clearKeys) && body.clearKeys.length) {
    const allowed = new Set<LotKey>([
      "north", "east", "fence", "rc", "apron", "northlane", "southlane", "bay", "cards",
    ]);
    const keys = [...new Set(body.clearKeys)]
      .filter((key): key is LotKey => typeof key === "string" && allowed.has(key as LotKey));
    if (keys.length) ops.push({ type: "clear_lots", keys });
  }
  if (body.lots && typeof body.lots === "object") {
    for (const [key, value] of Object.entries(body.lots as Lots)) {
      if (Array.isArray(value)) ops.push({ type: "set_lot", key: key as LotKey, value: value.map((v) => String(v || "")) });
    }
  }
  const result = await applySheetOps(ops, typeof body.actor === "string" ? body.actor : "");
  return NextResponse.json({ ok: true, updatedAt: result.updatedAt, revision: result.revision, lots: result.sheet.lots || {} });
}
