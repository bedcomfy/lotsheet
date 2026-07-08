import { NextResponse } from "next/server";
import { applySheetOps, getSheet, listLatestSheetOps, listSheetOpsSince } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = parseInt(url.searchParams.get("since") || "0", 10);
  const latest = url.searchParams.get("latest") === "1";
  const [ops, { sheet, updatedAt, revision }] = await Promise.all([
    latest ? listLatestSheetOps(200) : listSheetOpsSince(Number.isFinite(since) ? since : 0),
    getSheet(),
  ]);
  return NextResponse.json({ ops, sheet, updatedAt, revision });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const actor = typeof body.actor === "string" ? body.actor : "";
  const result = await applySheetOps(body.ops || [], actor);
  return NextResponse.json({ ok: true, ...result });
}
