import { NextResponse } from "next/server";
import { getSheet, mergeSetSheet } from "../../lib/store";
import type { LotSheet, Lots } from "../../lib/types";

export const dynamic = "force-dynamic";

// Public: anyone can read the shared current sheet so it loads on every device.
export async function GET() {
  const { sheet, updatedAt } = await getSheet();
  return NextResponse.json({ sheet, updatedAt });
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
  const replace = body.force === true || !body.baseSheet;
  const { sheet, updatedAt } = await mergeSetSheet(body.baseSheet as LotSheet | null, incoming, replace);
  return NextResponse.json({ ok: true, updatedAt, sheet });
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
  const { sheet } = await getSheet();
  const base: LotSheet = (sheet && typeof sheet === "object" ? sheet : {}) as LotSheet;
  const next: LotSheet = { ...base, cells: { ...(base.cells || {}) }, lots: { ...(base.lots || {}) } };
  if (Array.isArray(body.clearBuses) && body.clearBuses.length) {
    const clear = new Set(body.clearBuses.filter((b: unknown) => typeof b === "string"));
    for (const [id, v] of Object.entries(next.cells)) {
      const num = typeof v === "string" ? v : (v as { num?: string })?.num || "";
      if (clear.has(num)) delete next.cells[id];
    }
    const POSITIONAL = new Set(["bay"]); // fixed spots keep their slot, blanked
    for (const [key, arr] of Object.entries(next.lots as Lots)) {
      if (!Array.isArray(arr)) continue;
      (next.lots as Record<string, string[]>)[key] = POSITIONAL.has(key)
        ? arr.map((b) => (clear.has(b) ? "" : b))
        : arr.filter((b) => !clear.has(b));
    }
  }
  if (body.lots && typeof body.lots === "object") {
    next.lots = { ...next.lots, ...(body.lots as Lots) };
  }
  const { sheet: saved, updatedAt } = await mergeSetSheet(base, next, false);
  return NextResponse.json({ ok: true, updatedAt, lots: saved.lots || {} });
}
