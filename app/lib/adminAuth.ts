// Server-side admin check. The password lives in the ADMIN_PASSWORD environment
// variable (falls back to the historical default so an unset variable never
// locks anyone out). Unlocking sets an httpOnly cookie holding a keyed hash of
// the password; admin write routes require it. The password itself is never
// shipped to the browser any more.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "pace_admin";
export const ADMIN_COOKIE_MAX_AGE = 12 * 60 * 60; // seconds — one long shift
const FALLBACK_PASSWORD = "ride";

export function adminPassword(): string {
  return (process.env.ADMIN_PASSWORD || FALLBACK_PASSWORD).trim().toLowerCase();
}

export function passwordMatches(input: string): boolean {
  const a = Buffer.from(String(input || "").trim().toLowerCase());
  const b = Buffer.from(adminPassword());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminToken(password = adminPassword()): string {
  return createHmac("sha256", "pace-northwest-admin-session").update(password).digest("hex");
}

export function cookieToken(cookieHeader: string | null | undefined): string {
  const match = (cookieHeader || "").match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function isAdminRequest(req: Request): boolean {
  const presented = Buffer.from(cookieToken(req.headers.get("cookie")));
  const expected = Buffer.from(adminToken());
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "Unlock Admin Tools first." }, { status: 401 });
}
