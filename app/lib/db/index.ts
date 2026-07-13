// One data layer for every environment.
//
// Production (DATABASE_URL / Vercel Postgres) talks to Neon via node-postgres.
// Local development (no DATABASE_URL) runs PGlite — an embedded Postgres — so dev
// executes the EXACT same Drizzle queries as production, with data persisted to
// .data/pglite. This replaces the old hand-rolled JSON-file dev backend, so there
// is no longer a second storage codepath that can drift from the real one.
//
// STORAGE ISOLATION is unchanged: non-production deployments either use a fully
// separate PREVIEW_DATABASE_URL, or share the DB but write to env-suffixed tables
// (see schema.ts), so testing can never touch production data.

import path from "path";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema, TABLE_SUFFIX } from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const IS_PROD = process.env.VERCEL_ENV === "production";
const PG_URL =
  (!IS_PROD && process.env.PREVIEW_DATABASE_URL) ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

const T = (base: string) => `${base}${TABLE_SUFFIX}`;

// Idempotent schema setup — the same CREATE TABLE / ADD COLUMN IF NOT EXISTS the
// app has always run on connect, so existing production tables are untouched and
// a fresh PGlite dev database is created on first use.
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS ${T("bus_flags")} (bus TEXT PRIMARY KEY, flag TEXT, note TEXT, updated_at TIMESTAMPTZ DEFAULT now())`,
  `ALTER TABLE ${T("bus_flags")} ADD COLUMN IF NOT EXISTS note TEXT`,
  `ALTER TABLE ${T("bus_flags")} ADD COLUMN IF NOT EXISTS insp_miles INTEGER`,
  `ALTER TABLE ${T("bus_flags")} ADD COLUMN IF NOT EXISTS hold_reason TEXT`,
  `ALTER TABLE ${T("bus_flags")} ADD COLUMN IF NOT EXISTS retorque_tires TEXT`,
  `ALTER TABLE ${T("bus_flags")} ADD COLUMN IF NOT EXISTS insp_option TEXT`,
  `CREATE TABLE IF NOT EXISTS ${T("app_state")} (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS ${T("sheet_history")} (id BIGSERIAL PRIMARY KEY, data JSONB, saved_at TIMESTAMPTZ DEFAULT now())`,
  `ALTER TABLE ${T("sheet_history")} ADD COLUMN IF NOT EXISTS sheet_key TEXT`,
  `CREATE TABLE IF NOT EXISTS ${T("lot_sheet_ops")} (revision BIGSERIAL PRIMARY KEY, op JSONB NOT NULL, actor TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS ${T("audit_events")} (id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, actor TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT now())`,
];

let _dbPromise: Promise<DB> | undefined;

async function create(): Promise<DB> {
  let db: DB;
  if (PG_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
    db = drizzle(pool, { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
    // PGlite and node-postgres expose the same Drizzle query API; the cast keeps
    // store.ts written against a single db type.
    db = drizzle(client, { schema }) as unknown as DB;
  }
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
  return db;
}

// Lazy singleton — the connection + schema setup happen once, on first use.
export function getDb(): Promise<DB> {
  if (!_dbPromise) _dbPromise = create();
  return _dbPromise;
}
