// Site gate. Every request is served a decoy typing-test page until the browser
// holds the unlock cookie, which is handed out only when the passphrase is
// typed into that page. Runtime-agnostic (Web Crypto only) because the check
// runs in proxy.ts as well as in route handlers. See docs/site-gate.md.

export const GATE_COOKIE = "kf_session";
export const GATE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // seconds
export const GATE_UNLOCK_PATH = "/api/typing/results";

// Requests that must get through without the cookie.
export const GATE_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  GATE_UNLOCK_PATH,
  // GitHub Actions posts here every 30 minutes with no browser session
  // (.github/workflows/fleetwatch-mileage.yml). The route accepts no payload.
  "/api/pm-mileage/sync",
]);

// SHA-256 of the built-in passphrase after normalizePhrase(). Setting
// SITE_GATE_PASSPHRASE replaces it, and because the cookie is keyed off the
// active hash, changing the passphrase also signs every browser out.
const BUILT_IN_HASH = "f1a476a93ec2c427e7682a9c50cc503926c658de835fb06b1f3d338b82fb686a";

const TOKEN_MESSAGE = "site-unlocked:v1";

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

export async function gateToken(): Promise<string> {
  return hmacHex(await gateKey(), TOKEN_MESSAGE);
}

export async function isGateTokenValid(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  return safeEqual(token, await gateToken());
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
    maxAge: GATE_COOKIE_MAX_AGE,
  };
}
