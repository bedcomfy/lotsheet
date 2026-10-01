import { afterEach, expect, it, vi } from "vitest";
import { GATE_COOKIE, GATE_COOKIE_MAX_AGE, gateToken } from "../../../lib/siteGate";
import { POST } from "./route";

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
  const res = await post({ text: "Open Sesame 42", wpm: 12, accuracy: 0 });
  expect(await res.json()).toEqual({ ok: true, personalBest: true });
  expect(res.cookies.get(GATE_COOKIE)).toMatchObject({
    value: await gateToken(),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: GATE_COOKIE_MAX_AGE,
  });
});
