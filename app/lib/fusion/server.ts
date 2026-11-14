import { NextResponse } from "next/server";
import {
  FUSION_ORIGIN, FUSION_PAGE_SIZE, FUSION_REQUEST_HEADER, FUSION_RESOURCES,
  FUSION_SEARCH_PATTERN, isFusionResource, parseFusionResult, type FusionResource,
} from "./config";

export const FUSION_COOKIE = "__Secure-pace-fusion-access";
export const FUSION_COOKIE_PATH = "/api/fusion";
export const MAX_TOKEN_LENGTH = 3500;
const MESSAGES = {
  AUTH: "Sign into Fusion and click Connect Lotsheet again.",
  FORBIDDEN: "Your Oracle account cannot read these records. Try another record type.",
  REQUEST: "This connection request is not valid. Open Lotsheet and try again.",
  FORMAT: "Oracle returned an unexpected response. Try again later.",
  NETWORK: "Oracle could not be reached. Try again shortly.",
  HTTP: "Oracle could not complete this read. Try another number or try again later.",
  STORAGE: "Private Oracle token storage is unavailable. Try again shortly.",
} as const;

export class FusionFailure extends Error {
  constructor(public code: keyof typeof MESSAGES, public status: number, public diagnostic?: { resource: string; upstreamStatus?: number; stage?: string }) { super(MESSAGES[code]); }
}

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie, X-Lotsheet-Fusion-Test, X-Lotsheet-Fusion-Connection",
  } });
}

export function failureResponse(error: unknown) {
  const failure = error instanceof FusionFailure ? error : new FusionFailure("NETWORK", 502);
  // Never serialize upstream bodies, request headers, or arbitrary error text.
  return privateJson({ code: failure.code, error: failure.message, ...(failure.diagnostic ? { diagnostic: failure.diagnostic } : {}) }, failure.status);
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get(FUSION_REQUEST_HEADER) !== "1" ||
      (site && site !== "same-origin") ||
      (origin && origin !== new URL(request.url).origin) ||
      (request.method !== "GET" && origin !== new URL(request.url).origin)) {
    throw new FusionFailure("REQUEST", 403);
  }
}

/** Expiry bounds local lifetime; Oracle verifies the credential before it is
 * saved and on every read. Decoding these claims does not verify a signature. */
export function tokenExpiry(token: unknown, now = Date.now()): number | null {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).exp;
    const expiresAt = exp * 1000;
    return typeof exp === "number" && Number.isSafeInteger(exp) &&
      expiresAt > now && expiresAt <= now + 86400000 ? expiresAt : null;
  } catch { return null; }
}

export function savedAccess(request: Request) {
  const entry = request.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(FUSION_COOKIE + "="));
  let token = "";
  try { token = decodeURIComponent(entry?.slice(FUSION_COOKIE.length + 1) ?? ""); } catch {}
  const expiresAt = tokenExpiry(token);
  return expiresAt ? { token, expiresAt } : null;
}

export function setAccessCookie(response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set(FUSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "strict", path: FUSION_COOKIE_PATH,
    expires: new Date(expiresAt), maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  });
}

export function clearAccessCookie(response: NextResponse) {
  response.cookies.set(FUSION_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "strict", path: FUSION_COOKIE_PATH,
    expires: new Date(0), maxAge: 0,
  });
}

export function readParameters(params: URLSearchParams) {
  const resource = params.get("resource");
  const search = (params.get("search") ?? "").trim();
  const offsetText = params.get("offset") ?? "0";
  const offset = Number(offsetText);
  if ([...params.keys()].some(key => !["resource", "search", "offset"].includes(key) || params.getAll(key).length !== 1) ||
      !isFusionResource(resource) || !FUSION_SEARCH_PATTERN.test(search) ||
      !/^\d+$/.test(offsetText) || !Number.isInteger(offset) || offset > 10000) throw new FusionFailure("REQUEST", 400);
  return { resource, search, offset };
}

export async function readOracle(token: string, resource: FusionResource, search = "", offset = 0, limit = FUSION_PAGE_SIZE) {
  const expiresAt = tokenExpiry(token);
  if (!expiresAt) throw new FusionFailure("AUTH", 401);
  const definition = FUSION_RESOURCES[resource];
  const fields = definition.columns.map(column => column.key);
  const query = new URLSearchParams({ onlyData: "true", limit: String(limit), offset: String(offset), fields: fields.join(",") });
  if (search) query.set("q", definition.searchField + "='" + search + "'");
  let response: Response;
  try {
    response = await fetch(FUSION_ORIGIN + "/fscmRestApi/resources/11.13.18.05/" + definition.path + "?" + query, {
      method: "GET", headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
  } catch { throw new FusionFailure("NETWORK", 502); }
  if (response.status === 401) throw new FusionFailure("AUTH", 401);
  if (response.status === 403) throw new FusionFailure("FORBIDDEN", 403);
  if (!response.ok) throw new FusionFailure("HTTP", 502);
  const body = await response.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) throw new FusionFailure("FORMAT", 502);
  const result = parseFusionResult({ resource, items: body.items.slice(0, limit), offset,
    hasMore: body.hasMore === true, expiresAt, fetchedAt: Date.now() });
  if (!result) throw new FusionFailure("FORMAT", 502);
  if (!tokenExpiry(token)) throw new FusionFailure("AUTH", 401);
  return result;
}

export async function verifyOracleAccess(token: string) {
  try { await readOracle(token, "workOrders", "", 0, 1); }
  catch (error) {
    if (!(error instanceof FusionFailure) || error.code !== "FORBIDDEN") throw error;
    await readOracle(token, "assets", "", 0, 1);
  }
}
