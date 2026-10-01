import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, GATE_COOKIE, GATE_EXEMPT_PATHS, clearedCookieOptions, isGateTokenValid } from "./app/lib/siteGate";
import { decoyPage } from "./app/lib/siteGateDecoy";

// Site gate: without the unlock cookie every page is the decoy typing test
// and everything else (API paths, Next's own chunks and images, files) is a
// 404. Nothing about the real site is reachable. See docs/site-gate.md.
//
// Deliberately no `config.matcher`: a request the matcher skips would bypass
// the gate, so every request is checked, static chunks included (the decoy
// has none of its own). The only pass-throughs are GATE_EXEMPT_PATHS.

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (GATE_EXEMPT_PATHS.has(pathname)) return NextResponse.next();
  if (await isGateTokenValid(req.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  return lockedResponse(pathname);
}

// Page-like paths get the decoy; anything that looks like an API call, a
// Next internal, or a file gets a bare 404 so nothing can be enumerated.
export function lockedResponse(pathname: string): NextResponse {
  const noStore = { "cache-control": "no-store" };
  const response = /^\/(api|_next|_vercel)(\/|$)/i.test(pathname) || /\.[a-z0-9]+$/i.test(pathname)
    ? NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore })
    : new NextResponse(decoyPage(), {
      status: 200,
      headers: { ...noStore, "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
    });
  // A locked browser holds no session: drop an expired site cookie and the
  // admin cookie with it, so the next unlock starts from scratch.
  response.cookies.set(GATE_COOKIE, "", clearedCookieOptions());
  response.cookies.set(ADMIN_COOKIE, "", clearedCookieOptions());
  return response;
}
