import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, GATE_EXEMPT_PATHS, isGateTokenValid } from "./app/lib/siteGate";
import { decoyPage } from "./app/lib/siteGateDecoy";

// Site gate: without the unlock cookie every page is the decoy typing test
// and everything else (API paths, Next's own chunks and images, files) is a
// 404. Nothing about the real site is reachable. See docs/site-gate.md.
//
// Deliberately no `config.matcher`: a request the matcher skips would bypass
// the gate, so every request is checked, static chunks included (the decoy
// has none of its own). The only pass-throughs are GATE_EXEMPT_PATHS.

export default async function proxy(req: NextRequest): Promise<Response> {
  const { pathname } = req.nextUrl;
  if (GATE_EXEMPT_PATHS.has(pathname)) return NextResponse.next();
  if (await isGateTokenValid(req.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  return lockedResponse(pathname);
}

// Page-like paths get the decoy; anything that looks like an API call, a
// Next internal, or a file gets a bare 404 so nothing can be enumerated.
export function lockedResponse(pathname: string): Response {
  const noStore = { "cache-control": "no-store" };
  if (/^\/(api|_next|_vercel)(\/|$)/i.test(pathname) || /\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  }
  return new NextResponse(decoyPage(), {
    status: 200,
    headers: { ...noStore, "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}
