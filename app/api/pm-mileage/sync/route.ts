import { NextResponse } from "next/server";
import { syncFleetwatchMileage } from "../../../lib/fleetwatchSync";
import { fleetwatchAutoSyncEnabled } from "../../../lib/fleetwatchFlag";

export const AUTO_SYNC_OFF_MESSAGE = "Automatic Fleetwatch updates are turned off. Upload the report with Import PDF on the PM Mileage page.";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Crew can request the fixed, trusted report without unlocking Admin Tools.
// No caller-supplied URL, readings, dates, or schedule fields are accepted.
export async function POST(req: Request) {
  // Switched off: nothing is downloaded and nothing changes. The code path
  // stays so FLEETWATCH_AUTO_SYNC=on brings it back without a deploy.
  if (!fleetwatchAutoSyncEnabled()) {
    return NextResponse.json({ ok: false, disabled: true, error: AUTO_SYNC_OFF_MESSAGE }, { status: 503 });
  }
  const origin = req.headers.get("origin");
  // Next may use an internal hostname in req.url behind its proxy. Compare
  // against the request's public Host header, which the browser cannot spoof.
  const host = req.headers.get("host") || new URL(req.url).host;
  let originMatches = !origin;
  try { if (origin) originMatches = new URL(origin).host === host; } catch { originMatches = false; }
  if (req.headers.get("sec-fetch-site") === "cross-site" || !originMatches) {
    return NextResponse.json({ error: "Use Update mileage now on the PM Mileage page." }, { status: 403 });
  }
  const result = await syncFleetwatchMileage();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
