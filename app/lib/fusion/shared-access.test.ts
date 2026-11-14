import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { TABLE_SUFFIX } from "../db/schema";
import { DELETE, GET, POST } from "../../api/fusion/session/route";
import { GET as readRecords } from "../../api/fusion/records/route";
import { GET as diagnostics } from "../../api/fusion/diagnostics/route";
import { FUSION_REQUEST_HEADER } from "./config";
import { withFusionAccess } from "./access";
import { FUSION_COOKIE, FusionFailure, privateJson } from "./server";
import { CONNECTION_HEADER, TEST_HEADER, TESTER_COOKIE, credentialId, decryptAccess, encryptAccess,
  machineAuthorized, rememberVerifiedToken, setTesterCookie, storedAccesses, testerPermit } from "./vault";

// Isolate the credential table from every configured development/production DB.
vi.mock("../db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const db = drizzle(new PGlite());
  return { getDb: async () => db };
});
const APP = "https://nwmaint.app", KEY = "ab".repeat(32);
const jwt = (name: string, seconds = 14400) => "e30." + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url") + ".test-" + name;
const fakeFetch = vi.fn();
const machine = () => ({ [TEST_HEADER]: createHmac("sha256", Buffer.from(KEY, "hex")).update("lotsheet:fusion:test-access:v1").digest("hex") });
const table = sql.raw(`fusion_test_credentials${TABLE_SUFFIX}`);
function request(path = "/session", method = "GET", headers: Record<string, string> = {}, body?: unknown) {
  return new Request(APP + "/api/fusion" + path, { method, headers: {
    [FUSION_REQUEST_HEADER]: "1", Origin: APP, "Content-Type": "application/json", ...headers,
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function permitCookie(token: string) {
  const response = privateJson({});
  const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp * 1000;
  setTesterCookie(response, { id: credentialId(token), token, expiresAt: exp });
  return TESTER_COOKIE + "=" + response.cookies.get(TESTER_COOKIE)!.value;
}
beforeEach(async () => {
  vi.stubEnv("FUSION_TEST_VAULT_KEY", KEY);
  fakeFetch.mockReset().mockImplementation(async () => Response.json({ items: [{ WorkOrderNumber: "NWD-1683" }], hasMore: false }));
  vi.stubGlobal("fetch", fakeFetch);
  await storedAccesses();
  await (await getDb()).execute(sql`DELETE FROM ${table}`);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("encrypted temporary Fusion test access", () => {
  it("saves only verified credentials encrypted, moves the bearer off the browser and restores without Fusion", async () => {
    const token = jwt("valid");
    const response = await POST(request("/session", "POST", {}, { accessToken: token }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ connected: true, storage: "server", shared: false });
    expect(response.cookies.get(FUSION_COOKIE)?.maxAge).toBe(0);
    const cookie = response.cookies.get(TESTER_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/api/fusion" });
    expect(cookie.value).not.toContain(token);
    const rows = (await (await getDb()).execute(sql`SELECT * FROM ${table}`)).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await storedAccesses()).toMatchObject([{ token }]);
    const restored = await GET(request("/session", "GET", { Cookie: TESTER_COOKIE + "=" + cookie.value }));
    expect(await restored.json()).toMatchObject({ connected: true, storage: "server" });
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
  it("does not save a forged token or authorize its browser", async () => {
    fakeFetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    const response = await POST(request("/session", "POST", {}, { accessToken: jwt("forged") }));
    expect(response.status).toBe(401);
    expect(response.cookies.get(TESTER_COOKIE)).toBeUndefined();
    expect(await storedAccesses()).toEqual([]);
  });
  it("migrates an existing browser bearer only after a successful Oracle read", async () => {
    const token = jwt("legacy");
    const response = await GET(request("/session", "GET", { Cookie: FUSION_COOKIE + "=" + token }));
    expect(await response.json()).toMatchObject({ connected: true, storage: "server" });
    expect(response.cookies.get(FUSION_COOKIE)?.maxAge).toBe(0);
    expect(response.cookies.get(TESTER_COOKIE)?.value).not.toContain(token);
    expect(await storedAccesses()).toHaveLength(1);
  });
  it("never lends saved access to anonymous visitors, wrong test keys or forged cookies", async () => {
    const token = jwt("owner"); await rememberVerifiedToken(token);
    const deniedHeaders: Record<string, string>[] = [{}, { [TEST_HEADER]: "wrong" }, { Cookie: permitCookie(token).replace("v1.", "v2.") }];
    for (const headers of deniedHeaders) {
      expect(machineAuthorized(request("/session", "GET", headers))).toBe(false);
      const response = await readRecords(request("/records?resource=workOrders", "GET", headers));
      expect(response.status).toBe(401);
    }
    expect(fakeFetch).not.toHaveBeenCalled();
    const allowed = await readRecords(request("/records?resource=workOrders", "GET", machine()));
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).not.toContain(token);
  });
  it("rejects tampering, swapped row identities and expired encryption envelopes", async () => {
    const access = await rememberVerifiedToken(jwt("encrypt"));
    const encrypted = encryptAccess(access);
    expect(decryptAccess(access.id, access.expiresAt, encrypted)).toEqual(access);
    expect(encryptAccess(access)).not.toBe(encrypted);
    expect(decryptAccess("a".repeat(64), access.expiresAt, encrypted)).toBeNull();
    expect(decryptAccess(access.id, access.expiresAt + 1000, encrypted)).toBeNull();
    expect(decryptAccess(access.id, access.expiresAt, encrypted.slice(0, -5) + "aaaaa")).toBeNull();
    vi.useFakeTimers(); vi.setSystemTime(access.expiresAt + 1);
    expect(decryptAccess(access.id, access.expiresAt, encrypted)).toBeNull();
  });
  it("falls back from a rejected saved token and removes only that rejected token", async () => {
    const first = await rememberVerifiedToken(jwt("first")), second = await rememberVerifiedToken(jwt("second"));
    const read = vi.fn(async (token: string) => {
      if (token === first.token) throw new FusionFailure("AUTH", 401);
      return "read succeeded";
    });
    const result = await withFusionAccess(request("/session", "GET", { Cookie: permitCookie(first.token) }), read);
    expect(result).toMatchObject({ result: "read succeeded", shared: true, access: { id: second.id } });
    expect((await storedAccesses()).map(row => row.id)).toEqual([second.id]);
  });
  it("retains resource-specific denied tokens and pins pagination to one credential", async () => {
    const first = await rememberVerifiedToken(jwt("first")), second = await rememberVerifiedToken(jwt("second"));
    const read = vi.fn(async (token: string) => {
      if (token === first.token) throw new FusionFailure("FORBIDDEN", 403);
      return "allowed";
    });
    expect((await withFusionAccess(request("/session", "GET", { Cookie: permitCookie(first.token) }), read)).access.id).toBe(second.id);
    expect(await storedAccesses()).toHaveLength(2);
    read.mockClear();
    await expect(withFusionAccess(request("/parts", "GET", { Cookie: permitCookie(first.token), [CONNECTION_HEADER]: first.id }), read, { pinned: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not use a borrowed token to extend a browser's authorization", async () => {
    const short = jwt("short", 30), long = await rememberVerifiedToken(jwt("long"));
    const cookie = permitCookie(short), req = request("/session", "GET", { Cookie: cookie });
    const result = await withFusionAccess(req, async () => true);
    expect(result.expiresAt).toBeLessThan(long.expiresAt);
    vi.useFakeTimers(); vi.setSystemTime(result.expiresAt + 1);
    expect(testerPermit(req)).toBeNull();
    await expect(withFusionAccess(req, async () => true)).rejects.toMatchObject({ code: "AUTH" });
  });
  it("disconnects the contributed token while preserving another tester's access", async () => {
    const first = await rememberVerifiedToken(jwt("first")), second = await rememberVerifiedToken(jwt("second"));
    const response = await DELETE(request("/session", "DELETE", { Cookie: permitCookie(first.token) }));
    expect(response.cookies.get(TESTER_COOKIE)?.maxAge).toBe(0);
    expect((await storedAccesses()).map(row => row.id)).toEqual([second.id]);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
  it("restricts diagnostics to the private test key and never returns raw upstream errors", async () => {
    const token = jwt("diagnostics"); await rememberVerifiedToken(token);
    expect((await diagnostics(request("/diagnostics", "GET", { Cookie: permitCookie(token) }))).status).toBe(403);
    expect((await diagnostics(request("/diagnostics?url=https://elsewhere.example", "GET", machine()))).status).toBe(400);
    fakeFetch.mockImplementation(async (url: string) => url.includes("itemsV2") ? new Response("Invalid attribute PrimaryUOMValue: " + token, { status: 400 }) : Response.json({ items: [], hasMore: false }));
    const response = await diagnostics(request("/diagnostics?kind=catalog", "GET", machine()));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.probes).toHaveLength(4);
    expect(body.probes[0]).toMatchObject({ status: 400, mentionedFields: ["PrimaryUOMValue"] });
    expect(JSON.stringify(body)).not.toContain(token);
  });
});
