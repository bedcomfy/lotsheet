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

// Merge ONLY the back-of-sheet lots / their reasons into the stored sheet,
// server-side, leaving the grid cells (and everything else) untouched. Used by
// the Turnover sheet so it shares the North/East/Fence lots two-way without
// overwriting the lot grid. Reasons are keyed by bus; empties are pruned.
export async function PATCH(req) {
  const body = await req.json().catch(() => ({}));
  const { sheet } = await getSheet();
  const base = sheet && typeof sheet === "object" ? sheet : {};
  const next = { ...base };
  if (body.lots && typeof body.lots === "object") {
    next.lots = { ...(base.lots || {}), ...body.lots };
  }
  if (body.lotReasons && typeof body.lotReasons === "object") {
    // Authoritative replace (pruned) — the sender holds the full reason set, so
    // a reason whose bus was removed simply isn't sent and is dropped.
    const clean = {};
    for (const [k, v] of Object.entries(body.lotReasons)) {
      if (v && String(v).trim()) clean[k] = v;
    }
    next.lotReasons = clean;
  }
  const updatedAt = await setSheet(next);
  return NextResponse.json({ ok: true, updatedAt, lots: next.lots || {}, lotReasons: next.lotReasons || {} });
}
