import { NextResponse } from "next/server";
import { DEFAULT_MASTER, normalizeBusMaster } from "../../../lib/buses";
import { chicagoDateShort } from "../../../lib/chicagoTime";
import { buildTrackerWorkbook, trackerRows } from "../../../lib/pmTracker";
import { getPmMileage, getState } from "../../../lib/store";
import type { MasterBus } from "../../../lib/types";

export const dynamic = "force-dynamic";

// Download the master "PNW DAILY P.M. TRACKER" workbook built from what the
// PM Mileage page shows right now. Read-only, so anyone on the site can use
// it; the site gate is the only door.
export async function GET() {
  const masterValue = (await getState("bus_master")).value as { buses?: unknown } | null;
  const fleet = normalizeBusMaster(
    masterValue && Array.isArray(masterValue.buses) ? (masterValue as { buses: MasterBus[] }) : DEFAULT_MASTER,
  ).buses;
  const workbook = await buildTrackerWorkbook(trackerRows(await getPmMileage(), fleet));
  const stamp = chicagoDateShort(new Date()).replace(/\//g, "-");
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="PNW DAILY P.M. TRACKER ${stamp}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
