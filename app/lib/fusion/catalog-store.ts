import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { TABLE_SUFFIX } from "../db/schema";
import type { SavedCatalog } from "./catalog";

const table = sql.raw(`fusion_parts_catalog${TABLE_SUFFIX}`);
let initialized: Promise<void> | null = null;
async function database() {
  const db = await getDb();
  initialized ??= db.execute(sql`CREATE TABLE IF NOT EXISTS ${table} (organization TEXT PRIMARY KEY, snapshot JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL)`).then(() => {});
  try { await initialized; } catch (error) { initialized = null; throw error; }
  return db;
}
export async function readSavedCatalog(): Promise<SavedCatalog | null> {
  const result = await (await database()).execute(sql`SELECT snapshot FROM ${table} WHERE organization = 'NWD'`);
  return (result.rows[0]?.snapshot as SavedCatalog | undefined) ?? null;
}
export async function saveCatalog(catalog: SavedCatalog) {
  if (catalog.version !== 1 || catalog.organization !== "NWD" || catalog.organizationId !== "300000004581674" || !catalog.parts.length) throw Error("Invalid catalog");
  const body = JSON.stringify(catalog);
  if (Buffer.byteLength(body) > 3_500_000) throw Error("Catalog exceeds response limit");
  // One atomic replacement, only after every required Oracle source completed.
  // An older, slower refresh can never overwrite a more recent capture.
  await (await database()).execute(sql`INSERT INTO ${table} (organization, snapshot, fetched_at) VALUES ('NWD', ${body}::jsonb, ${new Date(catalog.fetchedAt).toISOString()}::timestamptz)
    ON CONFLICT (organization) DO UPDATE SET snapshot = excluded.snapshot, fetched_at = excluded.fetched_at
    WHERE (${table}.snapshot->>'startedAt')::bigint < (excluded.snapshot->>'startedAt')::bigint
      OR ((${table}.snapshot->>'startedAt')::bigint = (excluded.snapshot->>'startedAt')::bigint AND ${table}.fetched_at < excluded.fetched_at)`);
}
