import { NextResponse } from "next/server";
import { getState, setState } from "../../lib/store";
import type { Employee } from "../../lib/types";
import { EMPLOYEE_ROSTER_VERSION, mergeEmployeeRoster } from "../../lib/employees";

export const dynamic = "force-dynamic";

// The shared employee list used to autofill the Turnover sheet (and upcoming
// staffing sheets). Free text is still allowed everywhere — this is only for
// suggestions. Records are {firstName, lastName, badge, startDate, classification};
// legacy {name, badge} records are migrated by splitting name on the first space.
function sanitize(list: unknown): Employee[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Employee[] = [];
  for (const e of list) {
    let firstName = String(e?.firstName ?? "").trim();
    let lastName = String(e?.lastName ?? "").trim();
    const legacyName = String(e?.name ?? "").trim();
    if (!firstName && !lastName && legacyName) {
      const parts = legacyName.split(/\s+/);
      firstName = parts.shift() || "";
      lastName = parts.join(" ");
    }
    const badge = String(e?.badge ?? "").trim();
    const startDate = String(e?.startDate ?? "").trim();
    const hireDate = String(e?.hireDate ?? "").trim();
    const classification = String(e?.classification ?? "").trim();
    if (!firstName && !lastName && !badge) continue;
    const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${badge.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ firstName, lastName, badge, startDate, hireDate, classification });
  }
  return out;
}

export async function GET() {
  const { value, updatedAt } = await getState("employees");
  const v = value as { employees?: Employee[]; rosterVersion?: number } | null;
  const current = sanitize((v && v.employees) || []);
  if ((v?.rosterVersion || 0) < EMPLOYEE_ROSTER_VERSION) {
    const employees = mergeEmployeeRoster(current);
    const migratedAt = await setState("employees", { employees, rosterVersion: EMPLOYEE_ROSTER_VERSION });
    return NextResponse.json({ employees, updatedAt: migratedAt });
  }
  return NextResponse.json({ employees: current, updatedAt });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const employees = sanitize(body.employees);
  const updatedAt = await setState("employees", { employees, rosterVersion: EMPLOYEE_ROSTER_VERSION });
  return NextResponse.json({ ok: true, employees, updatedAt });
}
