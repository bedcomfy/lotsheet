import { NextResponse } from "next/server";
import { getState, setState } from "../../lib/store";
import { DEFAULT_MASTER } from "../../lib/buses";

export const dynamic = "force-dynamic";

const KEY = "bus_master";

// The current bus master list (the saved copy, or the built-in default).
export async function GET() {
  const { value, updatedAt } = await getState(KEY);
  const master = value && Array.isArray(value.buses) ? value : DEFAULT_MASTER;
  return NextResponse.json({ master, updatedAt: updatedAt || null });
}

// Save an edited master list. Each bus: { num, types: [], name? }.
export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  const master = body && body.master;
  if (!master || !Array.isArray(master.buses)) {
    return NextResponse.json({ error: "Bad master list" }, { status: 400 });
  }
  // Normalise: keep only valid entries, dedupe by number.
  const seen = new Set();
  const buses = [];
  for (const b of master.buses) {
    const num = String(b?.num || "").trim();
    if (!num || seen.has(num)) continue;
    seen.add(num);
    buses.push({
      num,
      length: typeof b.length === "string" ? b.length : "",
      model: typeof b.model === "string" ? b.model : "",
      type: typeof b.type === "string" ? b.type : "standard",
      status: b.status === "retired" ? "retired" : "active",
      lane: !!b.lane,
      ...(b.name ? { name: String(b.name) } : {}),
    });
  }
  const updatedAt = await setState(KEY, { buses });
  return NextResponse.json({ ok: true, master: { buses }, updatedAt });
}
