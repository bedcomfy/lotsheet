import { NextResponse } from "next/server";
import { applySheetOps, getSheet, listLatestSheetOps, listSheetOpsSince } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = parseInt(url.searchParams.get("since") || "0", 10);
  const latest = url.searchParams.get("latest") === "1";
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "500", 10) || 500));
  const safeSince = Number.isFinite(since) ? Math.max(0, since) : 0;
  const [ops, { sheet, updatedAt, revision }] = await Promise.all([
    latest ? listLatestSheetOps(Math.min(limit, 200)) : listSheetOpsSince(safeSince, limit),
    getSheet(),
  ]);
  const nextRevision = ops[ops.length - 1]?.revision || safeSince;
  return NextResponse.json({
    ops,
    sheet,
    updatedAt,
    revision,
    nextRevision,
    hasMore: !latest && nextRevision < revision,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const actor = typeof body.actor === "string" ? body.actor : "";
  const result = await applySheetOps(body.ops || [], actor);
  return NextResponse.json({ ok: true, ...result });
}
