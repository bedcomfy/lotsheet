import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GATE_COOKIE,
  GATE_SESSION_SECONDS,
  cookieFromHeader,
  gateKey,
  gateSessionExpiry,
  gateToken,
  isGateTokenValid,
  isUnlockedRequest,
  normalizePhrase,
  phraseMatches,
} from "./siteGate";

afterEach(() => vi.unstubAllEnvs());

describe("site gate", () => {
  it("accepts the configured passphrase regardless of case and spacing", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    expect(await phraseMatches("opensesame42")).toBe(true);
    expect(await phraseMatches("  Open Sesame 42 ")).toBe(true);
    expect(await phraseMatches("open sesame 43")).toBe(false);
    expect(await phraseMatches("")).toBe(false);
  });

  it("falls back to the built-in passphrase hash when the variable is unset", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "");
    expect(await gateKey()).toMatch(/^[0-9a-f]{64}$/);
    expect(await phraseMatches("the quick brown fox")).toBe(false);
  });

  it("issues a signed, timed token that only the active passphrase validates", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    const issuedAt = 1_790_000_000_000;
    const token = await gateToken(issuedAt);
    expect(token).toMatch(/^1790000000000\.[0-9a-f]{64}$/);
    expect(await gateToken(issuedAt)).toBe(token);
    expect(await isGateTokenValid(token, issuedAt)).toBe(true);
    expect(await gateSessionExpiry(token, issuedAt)).toBe(issuedAt + GATE_SESSION_SECONDS * 1000);
    // The session ends 30 minutes after unlock, whatever the browser does.
    expect(await isGateTokenValid(token, issuedAt + 29 * 60_000)).toBe(true);
    expect(await isGateTokenValid(token, issuedAt + 30 * 60_000)).toBe(false);
    // The issue time is covered by the signature, so it cannot be moved.
    const [, signature] = token.split(".");
    expect(await isGateTokenValid(`${issuedAt + 60 * 60_000}.${signature}`, issuedAt + 31 * 60_000)).toBe(false);
    expect(await isGateTokenValid(`${issuedAt}.${signature.slice(1)}0`, issuedAt)).toBe(false);
    // Issued "in the future" beyond clock skew is forged or broken.
    expect(await isGateTokenValid(token, issuedAt - 2 * 60_000)).toBe(false);
    expect(await isGateTokenValid(token, issuedAt - 30_000)).toBe(true);
    expect(await isGateTokenValid("", issuedAt)).toBe(false);
    expect(await isGateTokenValid(undefined, issuedAt)).toBe(false);
    expect(await isGateTokenValid(signature, issuedAt)).toBe(false);
    const fresh = await gateToken();
    const req = new Request("http://localhost/", { headers: { cookie: `theme=dark; ${GATE_COOKIE}=${fresh}` } });
    expect(await isUnlockedRequest(req)).toBe(true);
    expect(await isUnlockedRequest(new Request("http://localhost/"))).toBe(false);

    // Rotating the passphrase signs every browser out.
    vi.stubEnv("SITE_GATE_PASSPHRASE", "rotated phrase");
    expect(await isGateTokenValid(token, issuedAt)).toBe(false);
    expect(await isGateTokenValid(fresh)).toBe(false);
  });

  it("normalizes phrases and reads cookies", () => {
    expect(normalizePhrase("  Hello   World 1 ")).toBe("helloworld1");
    expect(cookieFromHeader("a=1; kf_session=abc%20d; b=2", "kf_session")).toBe("abc d");
    expect(cookieFromHeader("kf_session_other=zzz", "kf_session")).toBe("");
    expect(cookieFromHeader(null, "kf_session")).toBe("");
  });
});
