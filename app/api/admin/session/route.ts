import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  adminToken,
  isAdminRequest,
  passwordMatches,
} from "../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Is this browser unlocked? (The client checks on load so a stale
// "unlocked" flag never survives an expired cookie.)
export async function GET(req: Request) {
  return NextResponse.json({ unlocked: isAdminRequest(req) });
}

// Unlock: check the password on the server and hand back the session cookie.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!passwordMatches(typeof body?.password === "string" ? body.password : "")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
