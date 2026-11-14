import { clearAccessCookie, FusionFailure, privateJson, savedAccess, verifyOracleAccess } from "./server";
import { CONNECTION_HEADER, credentialId, forgetToken, machineAuthorized, rememberVerifiedToken, setTesterCookie, storedAccesses, testerPermit, vaultKey, type StoredAccess } from "./vault";

export interface ReadAccessResult<T> { result: T; access: StoredAccess; expiresAt: number; storage: "server" | "browser"; shared: boolean; migrated: boolean }
/** Resolve only authorized credentials. An anonymous visitor can never borrow the pool. */
export async function withFusionAccess<T>(request: Request, read: (token: string) => Promise<T>, options: { persist?: boolean; pinned?: boolean } = {}): Promise<ReadAccessResult<T>> {
  const own = savedAccess(request), permit = testerPermit(request), machine = machineAuthorized(request);
  const pin = options.pinned ? request.headers.get(CONNECTION_HEADER) : null;
  if (pin && !/^[a-f0-9]{64}$/.test(pin)) throw new FusionFailure("REQUEST", 400);
  const ownAccess = own ? { ...own, id: credentialId(own.token) } : null;
  let candidates: StoredAccess[] = ownAccess ? [ownAccess] : [];
  if (permit || machine) {
    const stored = await storedAccesses(pin ?? permit?.preferredId);
    candidates = [...candidates, ...stored.filter(row => row.id !== ownAccess?.id)];
  }
  if (pin) candidates = candidates.filter(row => row.id === pin);
  if (!candidates.length) throw new FusionFailure("AUTH", 401);
  let lastError: unknown = new FusionFailure("AUTH", 401);
  for (const access of candidates.slice(0, 3)) {
    try {
      const result = await read(access.token);
      let storage: "server" | "browser" = ownAccess?.id === access.id ? "browser" : "server";
      let migrated = false;
      if (options.persist && vaultKey() && ownAccess?.id === access.id) {
        // The successful protected Oracle read above verifies this legacy cookie.
        await rememberVerifiedToken(access.token); storage = "server"; migrated = true;
      }
      return { result, access, storage, migrated, shared: !!permit && access.id !== permit.preferredId || !!machine,
        expiresAt: Math.min(access.expiresAt, permit?.expiresAt ?? access.expiresAt) };
    } catch (error) {
      lastError = error;
      if (!(error instanceof FusionFailure) || !["AUTH", "FORBIDDEN"].includes(error.code)) throw error;
      if (error.code === "AUTH") await forgetToken(access.id);
      // Permission failure is resource-specific; retain that token for other reads.
      if (pin) break;
    }
  }
  throw lastError;
}
export function accessResponse<T>(value: ReadAccessResult<T>, body: unknown = value.result) {
  const response = privateJson(body);
  if (value.migrated) { setTesterCookie(response, value.access); clearAccessCookie(response); }
  return response;
}
export async function connectionStatus(request: Request) {
  try {
    const read = await withFusionAccess(request, verifyOracleAccess, { persist: true });
    return accessResponse(read, { connected: true, expiresAt: read.expiresAt, storage: read.storage, shared: read.shared });
  } catch (error) {
    if (error instanceof FusionFailure && error.code === "AUTH") return privateJson({ connected: false, expiresAt: null, storage: vaultKey() ? "server" : "browser", shared: false });
    throw error;
  }
}
