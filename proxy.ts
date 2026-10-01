import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, GATE_EXEMPT_PATHS, isGateTokenValid } from "./app/lib/siteGate";
import { decoyPage } from "./app/lib/siteGateDecoy";

// Site gate: without the unlock cookie every page is the decoy typing test
// and every API path is a 404. Nothing about the real site is reachable.
// See docs/site-gate.md.

export const config = {
  // Everything except Next's static chunks (the decoy has none of its own)
  // and the dev-server plumbing.
  matcher: ["/((?!_next/static|_next/webpack-hmr|__nextjs).*)"],
};

export default async function proxy(req: NextRequest): Promise<Response> {
  const { pathname } = req.nextUrl;
  if (GATE_EXEMPT_PATHS.has(pathname)) return NextResponse.next();
  if (await isGateTokenValid(req.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  return lockedResponse(pathname);
}

export function lockedResponse(pathname: string): Response {
  const noStore = { "cache-control": "no-store" };
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  }
  return new NextResponse(decoyPage(), {
    status: 200,
    headers: { ...noStore, "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}
