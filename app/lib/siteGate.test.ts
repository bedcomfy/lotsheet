import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GATE_COOKIE,
  cookieFromHeader,
  gateKey,
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

  it("issues a stable token that only the active passphrase validates", async () => {
    vi.stubEnv("SITE_GATE_PASSPHRASE", "open sesame 42");
    const token = await gateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await gateToken()).toBe(token);
    expect(await isGateTokenValid(token)).toBe(true);
    expect(await isGateTokenValid(token.slice(1) + "0")).toBe(false);
    expect(await isGateTokenValid("")).toBe(false);
    expect(await isGateTokenValid(undefined)).toBe(false);
    const req = new Request("http://localhost/", { headers: { cookie: `theme=dark; ${GATE_COOKIE}=${token}` } });
    expect(await isUnlockedRequest(req)).toBe(true);
    expect(await isUnlockedRequest(new Request("http://localhost/"))).toBe(false);

    // Rotating the passphrase signs every browser out.
    vi.stubEnv("SITE_GATE_PASSPHRASE", "rotated phrase");
    expect(await isGateTokenValid(token)).toBe(false);
  });

  it("normalizes phrases and reads cookies", () => {
    expect(normalizePhrase("  Hello   World 1 ")).toBe("helloworld1");
    expect(cookieFromHeader("a=1; kf_session=abc%20d; b=2", "kf_session")).toBe("abc d");
    expect(cookieFromHeader("kf_session_other=zzz", "kf_session")).toBe("");
    expect(cookieFromHeader(null, "kf_session")).toBe("");
  });
});
