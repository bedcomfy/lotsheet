import { NextResponse } from "next/server";
import { getState, setState } from "../../../lib/store";

export const dynamic = "force-dynamic";

// Sheets allowed to use the shared keyed store. Add new sheet keys here.
const ALLOWED = new Set(["fuel", "def", "turnover"]);

interface KeyParams {
  params: { key: string };
}

export async function GET(_req: Request, { params }: KeyParams) {
  const key = params.key;
  if (!ALLOWED.has(key)) {
    return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  }
  const { value, updatedAt } = await getState(key);
  return NextResponse.json({ value, updatedAt });
}

export async function PUT(req: Request, { params }: KeyParams) {
  const key = params.key;
  if (!ALLOWED.has(key)) {
    return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const updatedAt = await setState(key, body.value ?? null);
  return NextResponse.json({ ok: true, updatedAt });
}
