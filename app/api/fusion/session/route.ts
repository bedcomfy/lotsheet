import {
  clearAccessCookie, failureResponse, FusionFailure, MAX_TOKEN_LENGTH, privateJson,
  requireSameOrigin, savedAccess, setAccessCookie, tokenExpiry, verifyOracleAccess,
} from "../../../lib/fusion/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET(request: Request) {
  try {
    requireSameOrigin(request);
    const access = savedAccess(request);
    return privateJson({ connected: Boolean(access), expiresAt: access?.expiresAt ?? null });
  } catch (error) { return failureResponse(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json") ||
        Number(request.headers.get("content-length") ?? 0) > MAX_TOKEN_LENGTH + 100) throw new FusionFailure("REQUEST", 400);
    const raw = await request.text();
    if (raw.length > MAX_TOKEN_LENGTH + 100) throw new FusionFailure("REQUEST", 400);
    const body = JSON.parse(raw);
    const token = body?.accessToken;
    const expiresAt = tokenExpiry(token);
    if (!expiresAt) throw new FusionFailure("AUTH", 401);
    await verifyOracleAccess(token);
    const response = privateJson({ connected: true, expiresAt });
    setAccessCookie(response, token, expiresAt);
    return response;
  } catch (error) { return failureResponse(error instanceof SyntaxError ? new FusionFailure("REQUEST", 400) : error); }
}

export function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const response = privateJson({ connected: false, expiresAt: null });
    clearAccessCookie(response);
    return response;
  } catch (error) { return failureResponse(error); }
}
