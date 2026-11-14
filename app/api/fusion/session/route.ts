import {
  clearAccessCookie, failureResponse, FusionFailure, MAX_TOKEN_LENGTH, privateJson,
  requireSameOrigin, savedAccess, setAccessCookie, tokenExpiry, verifyOracleAccess,
} from "../../../lib/fusion/server";
import { connectionStatus } from "../../../lib/fusion/access";
import { clearTesterCookie, credentialId, forgetToken, rememberVerifiedToken, setTesterCookie, testerPermit, vaultKey } from "../../../lib/fusion/vault";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    requireSameOrigin(request);
    return await connectionStatus(request);
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
    const stored = vaultKey() ? await rememberVerifiedToken(token) : null;
    const response = privateJson({ connected: true, expiresAt, storage: stored ? "server" : "browser", shared: false });
    if (stored) { setTesterCookie(response, stored); clearAccessCookie(response); }
    else setAccessCookie(response, token, expiresAt);
    return response;
  } catch (error) { return failureResponse(error instanceof SyntaxError ? new FusionFailure("REQUEST", 400) : error); }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const own = savedAccess(request), permit = testerPermit(request);
    if (own || permit) await forgetToken(own ? credentialId(own.token) : permit!.preferredId);
    const response = privateJson({ connected: false, expiresAt: null, storage: vaultKey() ? "server" : "browser", shared: false });
    clearAccessCookie(response);
    clearTesterCookie(response);
    return response;
  } catch (error) { return failureResponse(error); }
}
