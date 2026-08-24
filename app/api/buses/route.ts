import { NextResponse } from "next/server";
import { getState, setState } from "../../lib/store";
import {
  busModelId,
  busWrapId,
  DEFAULT_MASTER,
  LEGACY_CATEGORY_TYPES,
  normalizeBusMaster,
} from "../../lib/buses";
import type { MasterBus } from "../../lib/types";

export const dynamic = "force-dynamic";

const KEY = "bus_master";

// The current bus master list (the saved copy, or the built-in default).
export async function GET() {
  const { value, updatedAt } = await getState(KEY);
  const v = value as { buses?: unknown } | null;
  const master = normalizeBusMaster(
    v && Array.isArray(v.buses) ? (v as { buses: MasterBus[] }) : DEFAULT_MASTER,
  );
  return NextResponse.json({ master, updatedAt: updatedAt || null });
}

// Save an edited master list. Each bus: { num, types: [], name? }.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const master = body && body.master;
  if (!master || !Array.isArray(master.buses)) {
    return NextResponse.json({ error: "Bad master list" }, { status: 400 });
  }
  // Normalise: keep only valid entries, dedupe by number. Store the multi-type
  // `types` array, migrating any legacy single `type` category.
  const seen = new Set<string>();
  const buses: MasterBus[] = [];
  for (const b of normalizeBusMaster(master).buses) {
    const num = String(b?.num || "").trim();
    if (!num || seen.has(num)) continue;
    seen.add(num);
    let types: string[];
    if (Array.isArray(b.types)) {
      types = Array.from(new Set((b.types as unknown[]).map((t) => String(t)).filter(Boolean)));
    } else if (typeof b.type === "string" && b.type) {
      types = LEGACY_CATEGORY_TYPES[b.type] || [b.type];
    } else {
      types = ["standard"];
    }
    buses.push({
      num,
      length: typeof b.length === "string" ? b.length : "",
      model: typeof b.model === "string" ? b.model : "",
      modelId: busModelId(b),
      wrapId: busWrapId(b),
      types,
      status: b.status === "retired" ? "retired" : "active",
      lane: !!b.lane,
      hybridLane: !!b.hybridLane,
      ...(b.name ? { name: String(b.name) } : {}),
    });
  }
  const updatedAt = await setState(KEY, { buses });
  return NextResponse.json({ ok: true, master: { buses }, updatedAt });
}
