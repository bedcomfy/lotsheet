import { NextResponse } from "next/server";
import { getPulse } from "../../lib/store";

export const dynamic = "force-dynamic";
// Let the long-poll hold the connection open (the client reconnects immediately
// if the platform cuts it short anyway).
export const maxDuration = 30;

const HOLD_MS = 25000; // how long one request waits before returning "no change"
const CHECK_MS = 1000; // how often it re-reads the change token
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Long-poll on the global change token: returns as soon as the token passes the
// client's `since`, or after ~25s. The client reconnects immediately with the
// new token, so any write propagates to every device within ~1s — without each
// client hammering the database on a fixed interval.
export async function GET(req: Request) {
  const since = parseInt(new URL(req.url).searchParams.get("since") || "0", 10) || 0;
  const deadline = Date.now() + HOLD_MS;
  let pulse = await getPulse();
  while (pulse <= since && Date.now() < deadline) {
    await sleep(CHECK_MS);
    pulse = await getPulse();
  }
  return NextResponse.json({ pulse, changed: pulse > since });
}
