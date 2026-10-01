import { afterEach, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, GATE_COOKIE, GATE_SESSION_SECONDS, gateToken } from "../../../lib/siteGate";
import { DELETE, GET, POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

function post(body: unknown) {
  return POST(new Request("http://localhost/api/typing/results", { method: "POST", body: JSON.stringify(body) }));
}

it("acknowledges an ordinary typing run without a cookie", async () => {
  vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
  const res = await post({ text: "The quick brown fox", wpm: 61, accuracy: 97 });
  expect(await res.json()).toEqual({ ok: true, personalBest: false });
  expect(res.cookies.get(GATE_COOKIE)).toBeUndefined();
  const empty = await post({});
  expect(await empty.json()).toEqual({ ok: true, personalBest: false });
});

it("hands out the unlock cookie when the run is the passphrase", async () => {
  vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
  const before = Date.now();
  const res = await post({ text: "Open Sesame 42", wpm: 12, accuracy: 0 });
  expect(await res.json()).toEqual({ ok: true, personalBest: true });
  const cookie = res.cookies.get(GATE_COOKIE);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: GATE_SESSION_SECONDS });
  const issuedAt = Number(cookie!.value.split(".")[0]);
  expect(issuedAt).toBeGreaterThanOrEqual(before);
  expect(cookie!.value).toBe(await gateToken(issuedAt));

  // The app can ask when the session ends, and log out.
  const session = await GET(new Request("http://localhost/api/typing/results", { headers: { cookie: `${GATE_COOKIE}=${cookie!.value}` } }));
  expect(await session.json()).toEqual({ ok: true, session: { expiresAt: issuedAt + GATE_SESSION_SECONDS * 1000 } });
  expect(await (await GET(new Request("http://localhost/api/typing/results"))).json()).toEqual({ ok: true, session: null });
  const logout = await DELETE();
  expect(await logout.json()).toEqual({ ok: true });
  expect(logout.cookies.get(GATE_COOKIE)).toMatchObject({ value: "", maxAge: 0, path: "/", httpOnly: true });
  expect(logout.cookies.get(ADMIN_COOKIE)).toMatchObject({ value: "", maxAge: 0, path: "/", httpOnly: true });
});
