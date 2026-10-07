import { NextResponse } from "next/server";
import { isAdminRequest, unauthorized } from "../../../lib/adminAuth";
import { syncFleetwatchVehicleList } from "../../../lib/fleetwatchSync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Force Update" on PM Mileage: fetch Fleetwatch's always-current Vehicle
// List Report and apply its odometers now. Admin Tools only, like Import
// PDF; it writes mileage for the whole fleet. Independent of the automatic
// update switch.
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return unauthorized();
  const result = await syncFleetwatchVehicleList();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
