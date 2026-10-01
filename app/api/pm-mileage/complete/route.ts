import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../lib/adminAuth";
import { completePm, PmConflictError } from "../../../lib/store";
import { parseBody, pmCompletePayloadSchema } from "../../../lib/schemas";
import { isInspectionType } from "../../../lib/pmMileage";
import { rejectCrossSitePmRequest } from "../../../lib/pmRequest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = rejectCrossSitePmRequest(req);
  if (blocked) return blocked;
  const { data, error } = await parseBody(req, pmCompletePayloadSchema);
  if (error) return error;
  const type = data.type ? data.type.trim().toUpperCase() : null;
  const miles = Number(String(data.miles).replace(/[,\s]/g, ""));
  if (!String(data.miles).trim() || !Number.isSafeInteger(miles) || miles <= 0 || miles > 2_147_483_647) {
    return NextResponse.json({ error: "Enter a valid, positive odometer reading." }, { status: 400 });
  }
  if (type && !isInspectionType(type)) return NextResponse.json({ error: "Choose a valid inspection type." }, { status: 400 });
  const completedAt = Date.parse(data.completedAt);
  if (completedAt > Date.now() + 5 * 60_000 || completedAt < Date.now() - 24 * 60 * 60_000) {
    return NextResponse.json({ error: "Reopen Complete to use the current date and time." }, { status: 400 });
  }
  try {
    const result = await completePm(data.bus, {
      kind: data.kind, type: data.kind === "inspection" && isInspectionType(type) ? type : null,
      miles, date: null,
    }, data.actor, { ...data, clearFlag: Boolean(data.clearFlag), admin: isAdminRequest(req) });
    return NextResponse.json({ ok: true, record: result.after, flagCleared: result.flagCleared });
  } catch (err) {
    return NextResponse.json({ error: err instanceof PmConflictError ? err.message : "Couldn't complete this PM. Try again." }, { status: err instanceof PmConflictError ? 409 : 500 });
  }
}
