import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { completePm, getFlags, recordAuditEvent, setBusFlags } from "../../../lib/store";
import { parseBody, pmCompletePayloadSchema } from "../../../lib/schemas";
import { isInspectionType } from "../../../lib/pmMileage";
import { removeInspection } from "../../../lib/grid";

export const dynamic = "force-dynamic";

// Mark an inspection or transmission PM as done. The completed one becomes
// the bus's "last" PM, so the next one (and the mileage it is due at) moves
// forward and the bus drops down the list. Optionally clears the bus's
// Inspection flag at the same time so the sheet and the PM list agree.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const { data, error } = await parseBody(req, pmCompletePayloadSchema);
  if (error) return error;
  const { bus, kind, miles, date, clearFlag, actor } = data;
  const type = data.type ? data.type.trim().toUpperCase() : null;
  if (type && !isInspectionType(type)) {
    return NextResponse.json({ error: `Unknown inspection type "${data.type}".` }, { status: 400 });
  }
  let result;
  try {
    result = await completePm(
      bus,
      {
        kind,
        type: kind === "inspection" && isInspectionType(type) ? type : null,
        miles: Number(String(miles).replace(/[,\s]/g, "")),
        date: date || null,
      },
      actor,
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not complete the PM." }, { status: 400 });
  }

  let flagCleared = false;
  if (kind === "inspection" && clearFlag) {
    const entry = (await getFlags())[bus];
    if (entry && (entry.flags || []).includes("inspection")) {
      const after = removeInspection(entry);
      await setBusFlags(bus, after);
      await recordAuditEvent("flag_update", { bus, before: entry, after }, actor);
      flagCleared = true;
    }
  }

  await recordAuditEvent(
    "pm_complete",
    {
      bus,
      kind,
      type: kind === "inspection" ? result.after.lastInspType : null,
      miles: kind === "inspection" ? result.after.lastInspMiles : result.after.lastTransMiles,
      date: date || null,
      flagCleared,
    },
    actor,
  );
  return NextResponse.json({ ok: true, record: result.after, flagCleared });
}
