import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { TABLE_SUFFIX } from "../db/schema";
import { tokenExpiry, FusionFailure, privateJson, FUSION_COOKIE_PATH } from "./server";

export const TESTER_COOKIE = "__Secure-pace-fusion-tester";
export const TEST_HEADER = "X-Lotsheet-Fusion-Test";
export const CONNECTION_HEADER = "X-Lotsheet-Fusion-Connection";
type JsonResponse = ReturnType<typeof privateJson>;
export interface StoredAccess { id: string; token: string; expiresAt: number }
export interface TesterPermit { preferredId: string; expiresAt: number }
export function vaultKey() {
  const value = process.env.FUSION_TEST_VAULT_KEY ?? "";
  return /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
}
export function credentialId(token: string) { return createHash("sha256").update(token).digest("hex"); }
function equal(a: string, b: string) {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
/** Domain-separated credential for unattended private test reads. Never sent to browsers. */
export function machineAuthorized(request: Request) {
  const key = vaultKey();
  return !!key && equal(request.headers.get(TEST_HEADER) ?? "", createHmac("sha256", key).update("lotsheet:fusion:test-access:v1").digest("hex"));
}
function signature(payload: string) {
  const key = vaultKey();
  if (!key) throw new FusionFailure("STORAGE", 503);
  return createHmac("sha256", key).update("lotsheet:fusion:tester:v1:" + payload).digest("base64url");
}
export function testerPermit(request: Request): TesterPermit | null {
  const raw = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(TESTER_COOKIE + "="))?.slice(TESTER_COOKIE.length + 1);
  if (!vaultKey() || !raw || raw.length > 300) return null;
  const [version, id, expires, salt, sig, extra] = raw.split(".");
  if (extra || version !== "v1" || !/^[a-f0-9]{64}$/.test(id ?? "") || !/^\d{13}$/.test(expires ?? "") || !/^[a-f0-9]{32}$/.test(salt ?? "")) return null;
  const expiresAt = Number(expires);
  if (expiresAt <= Date.now() || expiresAt > Date.now() + 86400000 || !equal(sig ?? "", signature([version, id, expires, salt].join(".")))) return null;
  return { preferredId: id, expiresAt };
}
export function setTesterCookie(response: JsonResponse, access: StoredAccess) {
  const payload = ["v1", access.id, access.expiresAt, randomBytes(16).toString("hex")].join(".");
  response.cookies.set(TESTER_COOKIE, payload + "." + signature(payload), { httpOnly: true, secure: true, sameSite: "strict", path: FUSION_COOKIE_PATH,
    expires: new Date(access.expiresAt), maxAge: Math.max(0, Math.floor((access.expiresAt - Date.now()) / 1000)) });
}
export function clearTesterCookie(response: JsonResponse) {
  response.cookies.set(TESTER_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: FUSION_COOKIE_PATH, maxAge: 0, expires: new Date(0) });
}
export function encryptAccess(access: StoredAccess): string {
  const key = vaultKey(); if (!key) throw new FusionFailure("STORAGE", 503);
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(access.id + ":" + access.expiresAt));
  const ciphertext = Buffer.concat([cipher.update(access.token, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptAccess(id: string, expiresAt: number, encrypted: string): StoredAccess | null {
  const key = vaultKey(); if (!key || expiresAt <= Date.now()) return null;
  try {
    const [version, nonce, tag, data, extra] = encrypted.split(".");
    if (version !== "v1" || extra || encrypted.length > 6000) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(id + ":" + expiresAt)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const token = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    return credentialId(token) === id && tokenExpiry(token) === expiresAt ? { id, token, expiresAt } : null;
  } catch { return null; }
}
// Dedicated table; never place credentials in the general sheet/state store.
const table = sql.raw(`fusion_test_credentials${TABLE_SUFFIX}`);
let initialized: Promise<void> | null = null;
async function database() {
  if (!vaultKey()) throw new FusionFailure("STORAGE", 503);
  const db = await getDb();
  initialized ??= db.execute(sql`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, encrypted TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL DEFAULT now())`).then(() => {});
  try { await initialized; } catch { initialized = null; throw new FusionFailure("STORAGE", 503); }
  return db;
}
export async function rememberVerifiedToken(token: string): Promise<StoredAccess> {
  const expiresAt = tokenExpiry(token); if (!expiresAt) throw new FusionFailure("AUTH", 401);
  const access = { id: credentialId(token), token, expiresAt };
  try {
    const db = await database();
    await db.execute(sql`DELETE FROM ${table} WHERE expires_at <= now()`);
    await db.execute(sql`INSERT INTO ${table} (id, encrypted, expires_at, verified_at) VALUES (${access.id}, ${encryptAccess(access)}, ${new Date(expiresAt).toISOString()}::timestamptz, now()) ON CONFLICT (id) DO UPDATE SET encrypted = excluded.encrypted, expires_at = excluded.expires_at, verified_at = now()`);
    return access;
  } catch (error) { if (error instanceof FusionFailure) throw error; throw new FusionFailure("STORAGE", 503); }
}
export async function storedAccesses(preferredId?: string): Promise<StoredAccess[]> {
  if (!vaultKey()) return [];
  try {
    const db = await database();
    await db.execute(sql`DELETE FROM ${table} WHERE expires_at <= now()`);
    const result = await db.execute(sql`SELECT id, encrypted, expires_at FROM ${table} WHERE expires_at > now() ORDER BY (id = ${preferredId ?? ""}) DESC, expires_at DESC LIMIT 8`);
    const usable: StoredAccess[] = [];
    for (const row of result.rows as { id: string; encrypted: string; expires_at: Date | string }[]) {
      const value = decryptAccess(row.id, new Date(row.expires_at).getTime(), row.encrypted);
      if (value) usable.push(value); else await db.execute(sql`DELETE FROM ${table} WHERE id = ${row.id}`);
    }
    return usable;
  } catch (error) { if (error instanceof FusionFailure) throw error; throw new FusionFailure("STORAGE", 503); }
}
export async function forgetToken(id: string) {
  if (!vaultKey() || !/^[a-f0-9]{64}$/.test(id)) return;
  try { await (await database()).execute(sql`DELETE FROM ${table} WHERE id = ${id}`); }
  catch { throw new FusionFailure("STORAGE", 503); }
}
