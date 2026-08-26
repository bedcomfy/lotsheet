import { NextResponse } from "next/server";
import { listHistory, archiveSheet, deleteHistory } from "../../../../lib/store";

export const dynamic = "force-dynamic";

// Prev Sheets archive for the hub sheets (fuel / def / turnover), keyed per sheet.
const ALLOWED = new Set([
  "fuel",
  "def",
  "farebox",
  "turnover",
  "workorder",
  "interior-cleaning",
  "meter-readings",
  "bus-errors",
  "hybrid-daily",
  "hybrid-weekly",
  "monthly-cleaning",
  "request-time-off",
]);

function check(key: string): boolean {
  return ALLOWED.has(key);
}

// Next 15+ makes route `params` a Promise — await it before use.
interface KeyParams {
  params: Promise<{ key: string }>;
}

// List this sheet's archived copies, newest first.
export async function GET(_req: Request, { params }: KeyParams) {
  const { key } = await params;
  if (!check(key)) return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  const sheets = await listHistory(key);
  return NextResponse.json({ sheets });
}

// Archive a copy of this sheet (capped at 20 newest per sheet).
export async function POST(req: Request, { params }: KeyParams) {
  const { key } = await params;
  if (!check(key)) return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.sheet !== "object" || body.sheet === null) {
    return NextResponse.json({ error: "Missing sheet" }, { status: 400 });
  }
  const id = await archiveSheet(key, body.sheet);
  const sheets = await listHistory(key);
  return NextResponse.json({ ok: true, id, sheets });
}

// Delete one archived copy by id (?id=...).
export async function DELETE(req: Request, { params }: KeyParams) {
  const { key } = await params;
  if (!check(key)) return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteHistory(id);
  const sheets = await listHistory(key);
  return NextResponse.json({ ok: true, sheets });
}
