// Client-safe constants shared by the site gate (proxy.ts, app/lib/siteGate.ts),
// the admin session, and the browser components that log out or watch expiry.

export const GATE_COOKIE = "kf_session";
export const ADMIN_COOKIE = "pace_admin";

// The decoy typing test posts runs here; it also answers session questions and
// logs the browser out. Exempt from the gate.
export const GATE_UNLOCK_PATH = "/api/typing/results";

// A site session ends 30 minutes after unlock, however active the browser is.
export const GATE_SESSION_SECONDS = 30 * 60;

// localStorage key written on logout so other open tabs lock at once.
export const SITE_LOGOUT_KEY = "pace:site-logout";
