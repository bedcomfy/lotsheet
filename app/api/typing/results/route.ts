import { NextResponse } from "next/server";
import { GATE_COOKIE, gateCookieOptions, gateToken, phraseMatches } from "../../../lib/siteGate";

export const dynamic = "force-dynamic";

// The decoy typing test posts each finished run here. A run whose text is the
// site passphrase is reported as a "personal best": the response carries the
// unlock cookie and the page reloads into the real site. Every other run is
// acknowledged and dropped. Nothing is stored.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.slice(0, 200) : "";
  if (!(await phraseMatches(text))) {
    // Slow down guessing a little without making a real run feel laggy.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return NextResponse.json({ ok: true, personalBest: false });
  }
  const response = NextResponse.json({ ok: true, personalBest: true });
  response.cookies.set(GATE_COOKIE, await gateToken(), gateCookieOptions());
  return response;
}
