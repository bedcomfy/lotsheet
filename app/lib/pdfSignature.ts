import { createHash } from "node:crypto";

// Recursively sort object keys so a signature doesn't depend on key/row order
// (Postgres returns flag rows in no guaranteed order).
export function stableJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stableJson);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((o, k) => {
        o[k] = stableJson(obj[k]);
        return o;
      }, {});
  }
  return v;
}

// The PDF cache key: everything that can change the rendered page.
export function pdfSignature(data: unknown, maint: boolean, version: string): string {
  return createHash("sha1")
    .update(JSON.stringify({ v: version, maint: !!maint, data: stableJson(data ?? null) }))
    .digest("hex");
}
