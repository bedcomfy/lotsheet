import { NextResponse } from "next/server";
import { latestPmInspections, listPmInspections, PmConflictError, updatePmCompletionName } from "../../../lib/store";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { parseBody, pmCompletionNamePayloadSchema } from "../../../lib/schemas";
import { rejectCrossSitePmRequest } from "../../../lib/pmRequest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const bus = new URL(req.url).searchParams.get("bus")?.trim();
  return NextResponse.json({ entries: bus ? await listPmInspections(bus, 100) : await latestPmInspections() });
}

export async function PATCH(req: Request) {
  const blocked = rejectCrossSitePmRequest(req);
  if (blocked) return blocked;
  if (!isAdminRequest(req)) return unauthorized();
  const { data, error } = await parseBody(req, pmCompletionNamePayloadSchema);
  if (error) return error;
  try {
    const entry = await updatePmCompletionName(Number(data.id), data.bus, data.foremanSr, data.expectedForemanSr, data.actor);
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    return NextResponse.json({ error: err instanceof PmConflictError ? err.message : "Couldn't update the Foreman / SR name. Try again." },
      { status: err instanceof PmConflictError ? 409 : 500 });
  }
}
