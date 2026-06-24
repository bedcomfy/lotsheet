import { NextResponse } from "next/server";
import { listHistory, archiveSheet, deleteHistory } from "../../../lib/store";

export const dynamic = "force-dynamic";

// List the archived (previous/erased) sheets, newest first.
export async function GET() {
  const sheets = await listHistory();
  return NextResponse.json({ sheets });
}

// Archive a sheet into the history (capped at 20 newest on the server).
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.sheet !== "object" || body.sheet === null) {
    return NextResponse.json({ error: "Missing sheet" }, { status: 400 });
  }
  const id = await archiveSheet(body.sheet);
  const sheets = await listHistory();
  return NextResponse.json({ ok: true, id, sheets });
}

// Delete one archived sheet by id (?id=...).
export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await deleteHistory(id);
  const sheets = await listHistory();
  return NextResponse.json({ ok: true, sheets });
}
