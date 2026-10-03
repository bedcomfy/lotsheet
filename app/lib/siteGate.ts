// Site gate. Every request is served a decoy typing-test page until the browser
// holds the unlock cookie, which is handed out only when the passphrase is
// typed into that page. The cookie carries its issue time and is signed, so a
// session ends GATE_SESSION_SECONDS after unlock no matter what the browser
// does with the cookie. Runtime-agnostic (Web Crypto only) because the check
// runs in proxy.ts as well as in route handlers. See docs/site-gate.md.

import { ADMIN_COOKIE, GATE_COOKIE, GATE_SESSION_SECONDS, GATE_UNLOCK_PATH } from "./siteSession";
import { fleetwatchAutoSyncEnabled } from "./fleetwatchFlag";

export { ADMIN_COOKIE, GATE_COOKIE, GATE_SESSION_SECONDS, GATE_UNLOCK_PATH };

// The Fleetwatch sync endpoint. GitHub Actions posts here with no browser
// session (.github/workflows/fleetwatch-mileage.yml); the route accepts no
// payload. It is let through only while automatic updates are switched on.
export const FLEETWATCH_SYNC_PATH = "/api/pm-mileage/sync";

// Requests that must get through without the cookie.
export function isGateExemptPath(pathname: string): boolean {
  if (pathname === GATE_UNLOCK_PATH) return true;
  if (pathname === FLEETWATCH_SYNC_PATH) return fleetwatchAutoSyncEnabled();
  return false;
}

// SHA-256 of the built-in passphrase after normalizePhrase(). Setting
// SITE_GATE_PASSPHRASE replaces it, and because the cookie is keyed off the
// active hash, changing the passphrase also signs every browser out.
const BUILT_IN_HASH = "f1a476a93ec2c427e7682a9c50cc503926c658de835fb06b1f3d338b82fb686a";

const TOKEN_PREFIX = "site-unlocked:v2:";
// Tolerate a little clock drift between the server that issued a token and
// the one validating it.
const CLOCK_SKEW_MS = 60_000;

export function normalizePhrase(input: string): string {
  return String(input || "").toLowerCase().replace(/\s+/g, "");
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)));
}

// Constant-time comparison of two short strings.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function gateKey(): Promise<string> {
  const configured = (process.env.SITE_GATE_PASSPHRASE || "").trim();
  return configured ? sha256Hex(normalizePhrase(configured)) : BUILT_IN_HASH;
}

export async function phraseMatches(input: string): Promise<boolean> {
  const presented = await sha256Hex(normalizePhrase(input));
  return safeEqual(presented, await gateKey());
}

// "<issuedAtMs>.<hmac>" — the signature covers the issue time.
export async function gateToken(issuedAt = Date.now()): Promise<string> {
  const stamp = String(Math.floor(issuedAt));
  return `${stamp}.${await hmacHex(await gateKey(), TOKEN_PREFIX + stamp)}`;
}

// When a token's session ends, or null for a missing, forged, future, or
// expired token.
export async function gateSessionExpiry(token: string | null | undefined, now = Date.now()): Promise<number | null> {
  const match = /^(\d{1,16})\.([0-9a-f]{64})$/.exec(token || "");
  if (!match) return null;
  const issuedAt = Number(match[1]);
  const expected = await hmacHex(await gateKey(), TOKEN_PREFIX + match[1]);
  if (!safeEqual(match[2], expected)) return null;
  if (issuedAt > now + CLOCK_SKEW_MS) return null;
  const expiresAt = issuedAt + GATE_SESSION_SECONDS * 1000;
  return now < expiresAt ? expiresAt : null;
}

export async function isGateTokenValid(token: string | null | undefined, now = Date.now()): Promise<boolean> {
  return (await gateSessionExpiry(token, now)) !== null;
}

export function cookieFromHeader(cookieHeader: string | null | undefined, name: string): string {
  const match = (cookieHeader || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export async function isUnlockedRequest(req: Request): Promise<boolean> {
  return isGateTokenValid(cookieFromHeader(req.headers.get("cookie"), GATE_COOKIE));
}

export function gateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_SESSION_SECONDS,
  };
}

// Options that delete a session cookie. Logging out of the site also drops
// the admin cookie: leaving the site means leaving everything.
export function clearedCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
}
