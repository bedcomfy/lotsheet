import { NextResponse } from "next/server";
import { getState, setState } from "../../lib/store";

export const dynamic = "force-dynamic";

// The shared employee list (name + badge) used to autofill the Turnover sheet.
// Free text is still allowed everywhere — this is only for suggestions.
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
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
  return NextResponse.json({ employees: (value && value.employees) || [], updatedAt });
}

export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  const employees = sanitize(body.employees);
  const updatedAt = await setState("employees", { employees });
  return NextResponse.json({ ok: true, employees, updatedAt });
}
