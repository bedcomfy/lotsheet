import { PARTS_CACHE_AGE, indexIsComplete, type PartsIndex } from "./parts";

export interface PartsCache {
  load(connectionId: string): Promise<PartsIndex | null>;
  save(index: PartsIndex): Promise<void>;
  clear(): Promise<void>;
}

// A single browser-local snapshot, never credentials. It is only restored after
// the server validates the current connection against Oracle's NWD catalog.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lotsheet-nwd-parts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshot");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Cache unavailable"));
  });
}
async function transaction(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest) {
  const db = await database();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction("snapshot", mode);
      const request = operation(tx.objectStore("snapshot"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export function usableCache(value: unknown, connectionId: string, now = Date.now()): value is PartsIndex {
  if (!value || typeof value !== "object") return false;
  const v = value as PartsIndex;
  return v.version === 1 && v.connectionId === connectionId && v.expiresAt > now &&
    v.startedAt <= now && now - v.startedAt < PARTS_CACHE_AGE &&
    Array.isArray(v.parts) && v.parts.every(p => typeof p.id === "string" && typeof p.number === "string" && typeof p.description === "string") &&
    Array.isArray(v.locations) && Array.isArray(v.subinventories) && Array.isArray(v.balances) &&
    !!v.progress && ["catalog", "locations", "subinventories", "balances"].every(k => k in v.progress) && indexIsComplete(v);
}
export const browserPartsCache: PartsCache = {
  async load(connectionId) {
    try {
      const index = await transaction("readonly", store => store.get("current"));
      if (usableCache(index, connectionId)) return index;
      await this.clear();
    } catch { /* Private browsing or storage restrictions: use memory only. */ }
    return null;
  },
  async save(index) { try { await transaction("readwrite", store => store.put(index, "current")); } catch {} },
  async clear() { try { await transaction("readwrite", store => store.clear()); } catch {} },
};
