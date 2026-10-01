import { NextResponse } from "next/server";

export function rejectCrossSitePmRequest(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || new URL(req.url).host;
  let matches = !origin;
  try { if (origin) matches = new URL(origin).host === host; } catch { matches = false; }
  return req.headers.get("sec-fetch-site") === "cross-site" || !matches
    ? NextResponse.json({ error: "Use the PM Mileage page to make this change." }, { status: 403 }) : null;
}
