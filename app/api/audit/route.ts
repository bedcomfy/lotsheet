import { NextResponse } from "next/server";
import { listAuditEvents } from "../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const events = await listAuditEvents(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json({ events });
}
