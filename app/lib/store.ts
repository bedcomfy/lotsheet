// Shared storage for manager-set bus flags AND the shared "current" Lot Sheet.
//
// Bus flags: each entry is { flags: [flagId, ...], note: "custom issue text" }.
// A bus can have several flags plus an optional free-text note ("Other").
//
// Lot sheet: a single shared JSON blob (the current sheet everyone edits), so a
// sheet started on a phone can be printed from a company computer.
//
// Dev (no DATABASE_URL): local JSON files under .data/. Production
// (DATABASE_URL set): Postgres. The API surface is identical either way.
//
// STORAGE ISOLATION: production data is kept separate from preview/development so
// testing can never change the numbers production is using:
//   - If PREVIEW_DATABASE_URL is set, non-production deployments use that
//     database entirely.
//   - Otherwise non-production deployments share the database but write to their
//     own tables (suffixed by the Vercel environment, e.g. bus_flags_preview).

import { promises as fs } from "fs";
import path from "path";
import type { Pool as PgPool } from "pg";
import { mergeLotSheet } from "./lotSheetMerge";
import { applyLotSheetOpsToSheet, normalizeOps, type LotSheetOp, type LotSheetOpRecord } from "./lotSheetOps";
import type { FlagEntry, FlagMap, LotSheet } from "./types";
import { inspectionOptionFromText, setInspectionOption } from "./grid";

const IS_PROD = process.env.VERCEL_ENV === "production";

// Outside production, prefer a dedicated preview database if one is configured.
const PG_URL =
  (!IS_PROD && process.env.PREVIEW_DATABASE_URL) ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const usePg = !!PG_URL;

// Even when preview shares the production database, its data lives in separate
// tables so it can't clobber production. Production keeps the plain table names.
const ENV = process.env.VERCEL_ENV || "";
const TBL_SUFFIX = ENV && ENV !== "production" ? "_" + ENV.replace(/[^a-z]/gi, "") : "";
const T_FLAGS = `bus_flags${TBL_SUFFIX}`;
const T_STATE = `app_state${TBL_SUFFIX}`;
const T_HISTORY = `sheet_history${TBL_SUFFIX}`;
const T_SHEET_OPS = `lot_sheet_ops${TBL_SUFFIX}`;
const T_AUDIT = `audit_events${TBL_SUFFIX}`;

const DATA_DIR = path.join(process.cwd(), ".data");
const FLAGS_FILE = path.join(DATA_DIR, "flags.json");
const SHEET_FILE = path.join(DATA_DIR, "sheet.json");
const SHEET_OPS_FILE = path.join(DATA_DIR, "sheet_ops.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const STATES_FILE = path.join(DATA_DIR, "states.json"); // generic keyed sheets (fuel, def, turnover…)

// Normalise a stored miles value to an integer or null.
function toMiles(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// Normalise any stored shape (old string, old array, or new object) to an entry.
const EMPTY_ENTRY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
function toEntry(v: unknown): FlagEntry {
  if (!v) return { ...EMPTY_ENTRY };
  if (Array.isArray(v)) return { ...EMPTY_ENTRY, flags: v.filter(Boolean) };
  if (typeof v === "string") return { ...EMPTY_ENTRY, flags: v.split(",").filter(Boolean) };
  const o = v as Record<string, unknown>;
  let flags: string[] = Array.isArray(o.flags) ? o.flags.filter(Boolean) : [];
  const holdReason = flags.includes("hold") && typeof o.holdReason === "string" ? o.holdReason : "";
  const retorqueTires = flags.includes("retorque") && Array.isArray(o.retorqueTires) ? o.retorqueTires.filter(Boolean) : [];
  // A retorque needs a tire (a hold can stand on its own, reason optional).
  if (flags.includes("retorque") && retorqueTires.length === 0) flags = flags.filter((f) => f !== "retorque");
  const inspOption = flags.includes("inspection") && typeof o.inspOption === "string" ? o.inspOption.trim() : "";
  const entry: FlagEntry = {
    flags,
    note: typeof o.note === "string" ? o.note : "",
    inspMiles: toMiles(o.inspMiles),
    holdReason,
    retorqueTires,
    inspOption,
  };
  return inspectionOptionFromText(inspOption) ? setInspectionOption(entry, inspOption) : entry;
}
function isEmpty(e: FlagEntry): boolean {
  return !e.flags.length && !(e.note && e.note.trim());
}

// ---------- local JSON file backend (dev) ----------
async function fileRead(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FLAGS_FILE, "utf8"));
  } catch {
    return {};
  }
}
async function fileWrite(data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FLAGS_FILE, JSON.stringify(data, null, 2));
}

// ---------- Postgres backend (prod) ----------
let _pool: PgPool | undefined;
async function pool(): Promise<PgPool> {
  if (!_pool) {
    const { Pool } = await import("pg");
    _pool = new Pool({
      connectionString: PG_URL,
      ssl: { rejectUnauthorized: false },
    });
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS ${T_FLAGS} (
        bus TEXT PRIMARY KEY,
        flag TEXT,
        note TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    await _pool.query(`ALTER TABLE ${T_FLAGS} ADD COLUMN IF NOT EXISTS note TEXT`);
    await _pool.query(`ALTER TABLE ${T_FLAGS} ADD COLUMN IF NOT EXISTS insp_miles INTEGER`);
    await _pool.query(`ALTER TABLE ${T_FLAGS} ADD COLUMN IF NOT EXISTS hold_reason TEXT`);
    await _pool.query(`ALTER TABLE ${T_FLAGS} ADD COLUMN IF NOT EXISTS retorque_tires TEXT`);
    await _pool.query(`ALTER TABLE ${T_FLAGS} ADD COLUMN IF NOT EXISTS insp_option TEXT`);
    // Generic key/value store for shared app state (currently the lot sheet).
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS ${T_STATE} (
        key TEXT PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    // Archive of past/erased sheets (Prev Sheets), capped at 20 newest per sheet.
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS ${T_HISTORY} (
        id BIGSERIAL PRIMARY KEY,
        data JSONB,
        saved_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS ${T_SHEET_OPS} (
        revision BIGSERIAL PRIMARY KEY,
        op JSONB NOT NULL,
        actor TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS ${T_AUDIT} (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        actor TEXT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    // Which sheet each archive row belongs to (lot / fuel / def / …). Existing
    // rows predate this and are the lot sheet.
    await _pool.query(`ALTER TABLE ${T_HISTORY} ADD COLUMN IF NOT EXISTS sheet_key TEXT`);
  }
  return _pool;
}

// ---------- public API ----------
// Returns { [busNumber]: { flags: [...], note } } for buses that have content.
export async function getFlags(): Promise<FlagMap> {
  const out: FlagMap = {};
  if (usePg) {
    const { rows } = await (await pool()).query(
      `SELECT bus, flag, note, insp_miles, hold_reason, retorque_tires, insp_option FROM ${T_FLAGS}`
    );
    for (const r of rows) {
      const e = toEntry({
        flags: (r.flag || "").split(",").filter(Boolean),
        note: r.note || "",
        inspMiles: r.insp_miles,
        holdReason: r.hold_reason || "",
        retorqueTires: (r.retorque_tires || "").split(",").filter(Boolean),
        inspOption: r.insp_option || "",
      });
      if (!isEmpty(e)) out[r.bus] = e;
    }
    return out;
  }
  const data = await fileRead();
  for (const [bus, v] of Object.entries(data)) {
    const e = toEntry(v);
    if (!isEmpty(e)) out[bus] = e;
  }
  return out;
}

export async function setBusFlags(bus: string, entry: unknown): Promise<void> {
  const e = toEntry(entry);
  if (usePg) {
    const db = await pool();
    if (isEmpty(e)) {
      await db.query(`DELETE FROM ${T_FLAGS} WHERE bus = $1`, [bus]);
    } else {
      await db.query(
        `INSERT INTO ${T_FLAGS} (bus, flag, note, insp_miles, hold_reason, retorque_tires, insp_option, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (bus) DO UPDATE SET flag = $2, note = $3, insp_miles = $4, hold_reason = $5, retorque_tires = $6, insp_option = $7, updated_at = now()`,
        [bus, e.flags.join(","), e.note, e.inspMiles, e.holdReason, (e.retorqueTires || []).join(","), e.inspOption || ""]
      );
    }
    return;
  }
  const data = await fileRead();
  if (isEmpty(e)) delete data[bus];
  else data[bus] = e;
  await fileWrite(data);
}

// ---------- shared current lot sheet ----------
// The single sheet everyone edits. Returns { sheet, updatedAt } where sheet is
// the saved JSON (or null if none saved yet) and updatedAt is an ISO string.
const SHEET_KEY = "current";

async function readLocalSheetOps(): Promise<LotSheetOpRecord[]> {
  try {
    const data = JSON.parse(await fs.readFile(SHEET_OPS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeLocalSheetOps(ops: LotSheetOpRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SHEET_OPS_FILE, JSON.stringify(ops.slice(-1000), null, 2));
}

export async function getSheet(): Promise<{ sheet: LotSheet | null; updatedAt: string | null; revision: number }> {
  if (usePg) {
    const db = await pool();
    const [{ rows }, rev] = await Promise.all([
      db.query(
      `SELECT value, updated_at FROM ${T_STATE} WHERE key = $1`,
      [SHEET_KEY]
      ),
      db.query(`SELECT COALESCE(MAX(revision), 0)::bigint AS revision FROM ${T_SHEET_OPS}`),
    ]);
    const revision = Number(rev.rows[0]?.revision || 0);
    if (!rows.length) return { sheet: null, updatedAt: null, revision };
    return {
      sheet: rows[0].value || null,
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
      revision,
    };
  }
  try {
    const [raw, ops] = await Promise.all([
      fs.readFile(SHEET_FILE, "utf8").then((text) => JSON.parse(text)),
      readLocalSheetOps(),
    ]);
    return { sheet: raw.sheet || null, updatedAt: raw.updatedAt || null, revision: ops[ops.length - 1]?.revision || 0 };
  } catch {
    return { sheet: null, updatedAt: null, revision: 0 };
  }
}

export async function setSheet(sheet: LotSheet): Promise<string> {
  const updatedAt = new Date().toISOString();
  if (usePg) {
    await (await pool()).query(
      `INSERT INTO ${T_STATE} (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
       RETURNING updated_at`,
      [SHEET_KEY, sheet]
    );
    // Read back the canonical timestamp so all devices agree.
    const { rows } = await (await pool()).query(
      `SELECT updated_at FROM ${T_STATE} WHERE key = $1`,
      [SHEET_KEY]
    );
    return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : updatedAt;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SHEET_FILE, JSON.stringify({ sheet, updatedAt }, null, 2));
  return updatedAt;
}

export async function mergeSetSheet(
  baseSheet: LotSheet | null | undefined,
  incoming: LotSheet,
  force = false
): Promise<{ sheet: LotSheet; updatedAt: string }> {
  const fallbackUpdatedAt = new Date().toISOString();
  if (usePg) {
    const db = await pool();
    await db.query("BEGIN");
    try {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${T_STATE}:${SHEET_KEY}`]);
      const { rows } = await db.query(
        `SELECT value FROM ${T_STATE} WHERE key = $1`,
        [SHEET_KEY]
      );
      const current = (rows[0]?.value || null) as LotSheet | null;
      const next = force ? incoming : mergeLotSheet(baseSheet, incoming, current);
      const written = await db.query(
        `INSERT INTO ${T_STATE} (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
         RETURNING updated_at`,
        [SHEET_KEY, next]
      );
      await db.query("COMMIT");
      return {
        sheet: next,
        updatedAt: written.rows[0]?.updated_at
          ? new Date(written.rows[0].updated_at).toISOString()
          : fallbackUpdatedAt,
      };
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  const { sheet: current } = await getSheet();
  const next = force ? incoming : mergeLotSheet(baseSheet, incoming, current);
  const updatedAt = await setSheet(next);
  return { sheet: next, updatedAt };
}

export async function applySheetOps(
  rawOps: unknown,
  actor = ""
): Promise<{ sheet: LotSheet; updatedAt: string; revision: number; ops: LotSheetOpRecord[] }> {
  const ops = normalizeOps(rawOps);
  const fallbackUpdatedAt = new Date().toISOString();

  if (usePg) {
    const db = await pool();
    await db.query("BEGIN");
    try {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${T_STATE}:${SHEET_KEY}`]);
      const { rows } = await db.query(
        `SELECT value FROM ${T_STATE} WHERE key = $1`,
        [SHEET_KEY]
      );
      const current = (rows[0]?.value || null) as LotSheet | null;
      const next = applyLotSheetOpsToSheet(current, ops);
      const written = await db.query(
        `INSERT INTO ${T_STATE} (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
         RETURNING updated_at`,
        [SHEET_KEY, next]
      );
      const records: LotSheetOpRecord[] = [];
      for (const op of ops) {
        const inserted = await db.query(
          `INSERT INTO ${T_SHEET_OPS} (op, actor) VALUES ($1, $2)
           RETURNING revision, op, actor, created_at`,
          [op, actor || null]
        );
        const row = inserted.rows[0];
        records.push({
          revision: Number(row.revision),
          op: row.op as LotSheetOp,
          actor: row.actor || undefined,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        });
      }
      await db.query("COMMIT");
      return {
        sheet: next,
        updatedAt: written.rows[0]?.updated_at
          ? new Date(written.rows[0].updated_at).toISOString()
          : fallbackUpdatedAt,
        revision: records[records.length - 1]?.revision || (await getSheet()).revision,
        ops: records,
      };
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  const [{ sheet: current }, existing] = await Promise.all([getSheet(), readLocalSheetOps()]);
  const next = applyLotSheetOpsToSheet(current, ops);
  const updatedAt = await setSheet(next);
  let revision = existing[existing.length - 1]?.revision || 0;
  const now = new Date().toISOString();
  const records = ops.map((op) => ({
    revision: ++revision,
    op,
    actor: actor || undefined,
    createdAt: now,
  }));
  await writeLocalSheetOps([...existing, ...records]);
  return { sheet: next, updatedAt, revision, ops: records };
}

export async function listSheetOpsSince(since: number): Promise<LotSheetOpRecord[]> {
  const n = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0;
  if (usePg) {
    const { rows } = await (await pool()).query(
      `SELECT revision, op, actor, created_at FROM ${T_SHEET_OPS}
       WHERE revision > $1 ORDER BY revision ASC LIMIT 500`,
      [n]
    );
    return rows.map((row) => ({
      revision: Number(row.revision),
      op: row.op as LotSheetOp,
      actor: row.actor || undefined,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));
  }
  return (await readLocalSheetOps()).filter((op) => op.revision > n).slice(0, 500);
}

export async function listLatestSheetOps(limit = 200): Promise<LotSheetOpRecord[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  if (usePg) {
    const { rows } = await (await pool()).query(
      `SELECT revision, op, actor, created_at FROM ${T_SHEET_OPS}
       ORDER BY revision DESC LIMIT $1`,
      [n]
    );
    return rows.map((row) => ({
      revision: Number(row.revision),
      op: row.op as LotSheetOp,
      actor: row.actor || undefined,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));
  }
  return (await readLocalSheetOps()).slice(-n).reverse();
}

// ---------- generic keyed sheet state (fuel, def, turnover…) ----------
// Same app_state table as the lot sheet, just under different keys, so any new
// sheet gets shared cross-device storage for free. Returns { value, updatedAt }.
export async function getState(key: string): Promise<{ value: unknown; updatedAt: string | null }> {
  if (usePg) {
    const { rows } = await (await pool()).query(
      `SELECT value, updated_at FROM ${T_STATE} WHERE key = $1`,
      [key]
    );
    if (!rows.length) return { value: null, updatedAt: null };
    return {
      value: rows[0].value || null,
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
    };
  }
  try {
    const all = JSON.parse(await fs.readFile(STATES_FILE, "utf8"));
    const e = all[key];
    return e ? { value: e.value ?? null, updatedAt: e.updatedAt || null } : { value: null, updatedAt: null };
  } catch {
    return { value: null, updatedAt: null };
  }
}

export async function setState(key: string, value: unknown): Promise<string> {
  const updatedAt = new Date().toISOString();
  if (usePg) {
    await (await pool()).query(
      `INSERT INTO ${T_STATE} (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, value]
    );
    const { rows } = await (await pool()).query(
      `SELECT updated_at FROM ${T_STATE} WHERE key = $1`,
      [key]
    );
    return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : updatedAt;
  }
  let all: Record<string, { value: unknown; updatedAt: string }> = {};
  try {
    all = JSON.parse(await fs.readFile(STATES_FILE, "utf8"));
  } catch {}
  all[key] = { value, updatedAt };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATES_FILE, JSON.stringify(all, null, 2));
  return updatedAt;
}

// ---------- Prev Sheets (archive of past/erased sheets) ----------
const HISTORY_LIMIT = 20;
// Work orders are a persistent, searchable archive (looked up later by number /
// employee / operation), so keep far more of them. Each is small JSON (~few KB).
const WORKORDER_LIMIT = 500;
function historyLimit(key: string): number {
  return key === "workorder" ? WORKORDER_LIMIT : HISTORY_LIMIT;
}

export interface HistoryEntry {
  id: string;
  sheet: unknown;
  savedAt: string | null;
}
type HistoryMap = Record<string, HistoryEntry[]>;

export interface AuditEvent {
  id: string;
  kind: string;
  actor?: string;
  details: unknown;
  createdAt: string | null;
}

async function readAuditFile(): Promise<AuditEvent[]> {
  try {
    const data = JSON.parse(await fs.readFile(AUDIT_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAuditFile(events: AuditEvent[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(AUDIT_FILE, JSON.stringify(events.slice(0, 1000), null, 2));
}

export async function recordAuditEvent(kind: string, details: unknown, actor = ""): Promise<void> {
  if (usePg) {
    await (await pool()).query(
      `INSERT INTO ${T_AUDIT} (kind, actor, details) VALUES ($1, $2, $3)`,
      [kind, actor || null, details ?? null]
    );
    return;
  }
  const events = await readAuditFile();
  events.unshift({
    id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    kind,
    actor: actor || undefined,
    details: details ?? null,
    createdAt: new Date().toISOString(),
  });
  await writeAuditFile(events);
}

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  if (usePg) {
    const { rows } = await (await pool()).query(
      `SELECT id, kind, actor, details, created_at FROM ${T_AUDIT}
       ORDER BY created_at DESC, id DESC LIMIT $1`,
      [n]
    );
    return rows.map((row) => ({
      id: String(row.id),
      kind: row.kind,
      actor: row.actor || undefined,
      details: row.details ?? null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));
  }
  return (await readAuditFile()).slice(0, n);
}

// The dev JSON file holds a map { sheetKey: [ {id, sheet, savedAt}, ... ] }.
// Old installs stored a bare array (lot sheet only) — migrate that to { lot: [] }.
async function historyFileRead(): Promise<HistoryMap> {
  try {
    const data = JSON.parse(await fs.readFile(HISTORY_FILE, "utf8"));
    if (Array.isArray(data)) return { lot: data };
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}
async function historyFileWrite(map: HistoryMap): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(map, null, 2));
}

// Newest first: [{ id, sheet, savedAt }]. At most HISTORY_LIMIT entries, scoped
// to one sheet (lot / fuel / def / …).
export async function listHistory(key = "lot"): Promise<HistoryEntry[]> {
  if (usePg) {
    const { rows } = await (await pool()).query(
      `SELECT id, data, saved_at FROM ${T_HISTORY}
       WHERE COALESCE(sheet_key, 'lot') = $1
       ORDER BY saved_at DESC, id DESC LIMIT $2`,
      [key, historyLimit(key)]
    );
    return rows.map((r) => ({
      id: String(r.id),
      sheet: r.data || null,
      savedAt: r.saved_at ? new Date(r.saved_at).toISOString() : null,
    }));
  }
  const map = await historyFileRead();
  return (map[key] || []).slice(0, historyLimit(key));
}

// Archive a sheet under its key, then trim that key to the newest HISTORY_LIMIT.
export async function archiveSheet(key: string, sheet: unknown): Promise<string> {
  const savedAt = new Date().toISOString();
  if (usePg) {
    const db = await pool();
    const { rows } = await db.query(
      `INSERT INTO ${T_HISTORY} (data, sheet_key) VALUES ($1, $2) RETURNING id`,
      [sheet, key]
    );
    await db.query(
      `DELETE FROM ${T_HISTORY} WHERE COALESCE(sheet_key, 'lot') = $1 AND id NOT IN (
        SELECT id FROM ${T_HISTORY} WHERE COALESCE(sheet_key, 'lot') = $1
        ORDER BY saved_at DESC, id DESC LIMIT $2
      )`,
      [key, historyLimit(key)]
    );
    return String(rows[0].id);
  }
  const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const map = await historyFileRead();
  map[key] = [{ id, sheet, savedAt }, ...(map[key] || [])].slice(0, historyLimit(key));
  await historyFileWrite(map);
  return id;
}

// Delete one archived sheet by id (ids are globally unique).
export async function deleteHistory(id: string): Promise<void> {
  if (usePg) {
    await (await pool()).query(`DELETE FROM ${T_HISTORY} WHERE id = $1`, [id]);
    return;
  }
  const map = await historyFileRead();
  for (const key of Object.keys(map)) {
    map[key] = (map[key] || []).filter((h) => String(h.id) !== String(id));
  }
  await historyFileWrite(map);
}

// ---------- cached PDF (so "Print PDF" is instant) ----------
// Stores the generated PDF (base64) keyed by sheet path + maintenance variant,
// with a signature of the data it was built from. One key per sheet/variant, so
// every sheet (lot, fuel, def, …) gets its own instant-print cache.
export interface PdfCache {
  signature: string;
  data: string;
}
function pdfKey(sheetPath: string | null | undefined, maint: boolean): string {
  const slug = !sheetPath || sheetPath === "/" ? "lot" : sheetPath.replace(/\W+/g, "");
  return `pdf_${slug}_${maint ? 1 : 0}`;
}
function pdfFile(sheetPath: string | null | undefined, maint: boolean): string {
  return path.join(DATA_DIR, `${pdfKey(sheetPath, maint)}.json`);
}

export async function getPdfCache(sheetPath: string, maint: boolean): Promise<PdfCache | null> {
  const key = pdfKey(sheetPath, maint);
  if (usePg) {
    const { rows } = await (await pool()).query(`SELECT value FROM ${T_STATE} WHERE key = $1`, [key]);
    return rows.length ? rows[0].value : null;
  }
  try {
    return JSON.parse(await fs.readFile(pdfFile(sheetPath, maint), "utf8"));
  } catch {
    return null;
  }
}

export async function setPdfCache(sheetPath: string, maint: boolean, signature: string, data: string): Promise<void> {
  const value: PdfCache = { signature, data };
  if (usePg) {
    await (await pool()).query(
      `INSERT INTO ${T_STATE} (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [pdfKey(sheetPath, maint), value]
    );
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(pdfFile(sheetPath, maint), JSON.stringify(value));
}
