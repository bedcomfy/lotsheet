import { NextResponse } from "next/server";
import { PmConflictError, undoPmInspection } from "../../../lib/store";
import { parseBody, pmUndoPayloadSchema } from "../../../lib/schemas";
import { rejectCrossSitePmRequest } from "../../../lib/pmRequest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = rejectCrossSitePmRequest(req);
  if (blocked) return blocked;
  const { data, error } = await parseBody(req, pmUndoPayloadSchema);
  if (error) return error;
  if (!Number.isSafeInteger(Number(data.id))) return NextResponse.json({ error: "Invalid completion." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, record: await undoPmInspection(Number(data.id), data.actor) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof PmConflictError ? err.message : "Couldn't undo this completion. Try again." }, { status: err instanceof PmConflictError ? 409 : 500 });
  }
}
