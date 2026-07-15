import { NextResponse } from "next/server";
import { getState, setState } from "../../../lib/store";
import { parseBody, statePayloadSchema } from "../../../lib/schemas";

export const dynamic = "force-dynamic";

// Sheets allowed to use the shared keyed store. Add new sheet keys here.
const ALLOWED = new Set(["fuel", "def", "farebox", "turnover", "workorder", "workpick"]);

// Next 15+ makes route `params` a Promise — await it before use.
interface KeyParams {
  params: Promise<{ key: string }>;
}

export async function GET(_req: Request, { params }: KeyParams) {
  const { key } = await params;
  if (!ALLOWED.has(key)) {
    return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  }
  const { value, updatedAt } = await getState(key);
  return NextResponse.json({ value, updatedAt });
}

export async function PUT(req: Request, { params }: KeyParams) {
  const { key } = await params;
  if (!ALLOWED.has(key)) {
    return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  }
  const { data, error } = await parseBody(req, statePayloadSchema);
  if (error) return error;
  const updatedAt = await setState(key, data.value ?? null);
  return NextResponse.json({ ok: true, updatedAt });
}
