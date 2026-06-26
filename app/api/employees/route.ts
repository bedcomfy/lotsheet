import { NextResponse } from "next/server";
import { getState, setState } from "../../lib/store";
import type { Employee } from "../../lib/types";

export const dynamic = "force-dynamic";

// The shared employee list (name + badge) used to autofill the Turnover sheet.
// Free text is still allowed everywhere — this is only for suggestions.
function sanitize(list: unknown): Employee[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Employee[] = [];
  for (const e of list) {
    const name = String(e?.name ?? "").trim();
    const badge = String(e?.badge ?? "").trim();
    if (!name && !badge) continue;
    const key = `${name.toLowerCase()}|${badge.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, badge });
  }
  return out;
}

export async function GET() {
  const { value, updatedAt } = await getState("employees");
  const v = value as { employees?: Employee[] } | null;
  return NextResponse.json({ employees: (v && v.employees) || [], updatedAt });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const employees = sanitize(body.employees);
  const updatedAt = await setState("employees", { employees });
  return NextResponse.json({ ok: true, employees, updatedAt });
}
