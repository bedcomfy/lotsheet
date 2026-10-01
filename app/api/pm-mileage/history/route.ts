import { NextResponse } from "next/server";
import { latestPmInspections, listPmInspections } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const bus = new URL(req.url).searchParams.get("bus")?.trim();
  return NextResponse.json({ entries: bus ? await listPmInspections(bus, 100) : await latestPmInspections() });
}
