import { NextResponse } from "next/server";
import { syncFleetwatchVehicleList } from "../../../lib/fleetwatchSync";
import { rejectCrossSitePmRequest } from "../../../lib/pmRequest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Force Update" on PM Mileage: fetch Fleetwatch's always-current Vehicle
// List Report (the dateless URL, nothing else) and apply its odometers now.
// The crew can press it without Admin Tools: the report is a fixed, trusted
// source and the request carries no readings, URL or schedule fields. Only
// the site session and a same-site check stand in front of it. Independent
// of the automatic update switch.
export async function POST(req: Request) {
  const rejected = rejectCrossSitePmRequest(req);
  if (rejected) return rejected;
  const result = await syncFleetwatchVehicleList();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
