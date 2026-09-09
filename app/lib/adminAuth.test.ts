import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_COOKIE, adminToken, cookieToken, isAdminRequest, passwordMatches } from "./adminAuth";

const original = process.env.ADMIN_PASSWORD;
afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = original;
});

describe("admin auth", () => {
  it("falls back to the historical password when the variable is unset", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(passwordMatches("ride")).toBe(true);
    expect(passwordMatches(" Ride ")).toBe(true);
    expect(passwordMatches("wrong")).toBe(false);
  });

  it("uses ADMIN_PASSWORD when set", () => {
    process.env.ADMIN_PASSWORD = "Garage-42";
    expect(passwordMatches("garage-42")).toBe(true);
    expect(passwordMatches("ride")).toBe(false);
  });

  it("accepts only a request carrying the current token cookie", () => {
    delete process.env.ADMIN_PASSWORD;
    const good = new Request("http://x/api/buses", { headers: { cookie: `theme=dark; ${ADMIN_COOKIE}=${adminToken()}` } });
    const bad = new Request("http://x/api/buses", { headers: { cookie: `${ADMIN_COOKIE}=nope` } });
    const none = new Request("http://x/api/buses");
    expect(isAdminRequest(good)).toBe(true);
    expect(isAdminRequest(bad)).toBe(false);
    expect(isAdminRequest(none)).toBe(false);
    expect(cookieToken(`a=1; ${ADMIN_COOKIE}=abc; b=2`)).toBe("abc");
  });

  it("changes the token when the password changes", () => {
    expect(adminToken("ride")).not.toBe(adminToken("other"));
    expect(adminToken("ride")).toBe(adminToken("ride"));
  });
});
