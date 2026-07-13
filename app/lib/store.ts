// Shared storage for manager-set bus flags AND the shared "current" Lot Sheet,
// plus the hub sheets, history, audit log and cached PDFs.
//
// One typed data layer (Drizzle) over Postgres — Neon in production, an embedded
// PGlite database in local dev (see ./db). The API surface below is unchanged;
// callers don't know or care which database is behind it.

import { asc, desc, eq, gt, max, sql } from "drizzle-orm";
import { getDb } from "./db";
import type { DB } from "./db";
import { appState, auditEvents, busFlags, lotSheetOps, sheetHistory, TABLE_SUFFIX } from "./db/schema";
import { mergeLotSheet } from "./lotSheetMerge";
import { applyLotSheetOpsToSheet, normalizeOps, type LotSheetOp, type LotSheetOpRecord } from "./lotSheetOps";
import type { FlagEntry, FlagMap, LotSheet } from "./types";
import { inspectionOptionFromText, setInspectionOption } from "./grid";

// ---------- flag-entry normalisation (unchanged) ----------
function toMiles(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

const EMPTY_ENTRY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };

// Normalise any stored shape (old string, old array, or new object) to an entry.
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

// ---------- change token (for real-time long-poll) ----------
// One monotonic counter bumped on every shared-data write, stored in app_state.
// The /api/live long-poll watches it so clients refetch the instant anything
// changes — without each client hammering the DB on a fixed interval.
const PULSE_KEY = "__pulse";
async function bumpPulse(db: DB): Promise<void> {
  await db.execute(sql`
    INSERT INTO ${appState} (key, value, updated_at)
    VALUES (${PULSE_KEY}, to_jsonb(1), now())
    ON CONFLICT (key) DO UPDATE SET
      value = to_jsonb(COALESCE((${appState}.value #>> '{}')::bigint, 0) + 1),
      updated_at = now()
  `);
}
export async function getPulse(): Promise<number> {
  const { value } = await getState(PULSE_KEY);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------- bus flags ----------
export async function getFlags(): Promise<FlagMap> {
  const db = await getDb();
  const rows = await db.select().from(busFlags);
  const out: FlagMap = {};
  for (const r of rows) {
    const e = toEntry({
      flags: (r.flag || "").split(",").filter(Boolean),
      note: r.note || "",
      inspMiles: r.inspMiles,
      holdReason: r.holdReason || "",
      retorqueTires: (r.retorqueTires || "").split(",").filter(Boolean),
      inspOption: r.inspOption || "",
    });
    if (!isEmpty(e)) out[r.bus] = e;
  }
  return out;
}

export async function setBusFlags(bus: string, entry: unknown): Promise<void> {
  const e = toEntry(entry);
  const db = await getDb();
  if (isEmpty(e)) {
    await db.delete(busFlags).where(eq(busFlags.bus, bus));
  } else {
    const values = {
      bus,
      flag: e.flags.join(","),
      note: e.note,
      inspMiles: e.inspMiles,
      holdReason: e.holdReason,
      retorqueTires: (e.retorqueTires || []).join(","),
      inspOption: e.inspOption || "",
      updatedAt: sql`now()`,
    };
    await db
      .insert(busFlags)
      .values(values)
      .onConflictDoUpdate({ target: busFlags.bus, set: { ...values, bus: undefined } });
  }
  await bumpPulse(db);
}

// ---------- shared current lot sheet ----------
const SHEET_KEY = "current";
const SHEET_LOCK = `app_state${TABLE_SUFFIX}:${SHEET_KEY}`;

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

export async function getSheet(): Promise<{ sheet: LotSheet | null; updatedAt: string | null; revision: number }> {
  const db = await getDb();
  const [stateRows, revRows] = await Promise.all([
    db.select({ value: appState.value, updatedAt: appState.updatedAt }).from(appState).where(eq(appState.key, SHEET_KEY)),
    db.select({ revision: max(lotSheetOps.revision) }).from(lotSheetOps),
  ]);
  const revision = Number(revRows[0]?.revision || 0);
  if (!stateRows.length) return { sheet: null, updatedAt: null, revision };
  return {
    sheet: (stateRows[0].value as LotSheet) || null,
    updatedAt: isoOrNull(stateRows[0].updatedAt),
    revision,
  };
}

export async function setSheet(sheet: LotSheet): Promise<string> {
  const db = await getDb();
  const rows = await db
    .insert(appState)
    .values({ key: SHEET_KEY, value: sheet, updatedAt: sql`now()` })
    .onConflictDoUpdate({ target: appState.key, set: { value: sheet, updatedAt: sql`now()` } })
    .returning({ updatedAt: appState.updatedAt });
  await bumpPulse(db);
  return isoOrNull(rows[0]?.updatedAt) || new Date().toISOString();
}

export async function mergeSetSheet(
  baseSheet: LotSheet | null | undefined,
  incoming: LotSheet,
  force = false
): Promise<{ sheet: LotSheet; updatedAt: string }> {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${SHEET_LOCK}))`);
    const rows = await tx.select({ value: appState.value }).from(appState).where(eq(appState.key, SHEET_KEY));
    const current = (rows[0]?.value || null) as LotSheet | null;
    const next = force ? incoming : mergeLotSheet(baseSheet, incoming, current);
    const written = await tx
      .insert(appState)
      .values({ key: SHEET_KEY, value: next, updatedAt: sql`now()` })
      .onConflictDoUpdate({ target: appState.key, set: { value: next, updatedAt: sql`now()` } })
      .returning({ updatedAt: appState.updatedAt });
    return { sheet: next, updatedAt: isoOrNull(written[0]?.updatedAt) || new Date().toISOString() };
  });
  await bumpPulse(db);
  return result;
}

export async function applySheetOps(
  rawOps: unknown,
  actor = ""
): Promise<{ sheet: LotSheet; updatedAt: string; revision: number; ops: LotSheetOpRecord[] }> {
  const ops = normalizeOps(rawOps);
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${SHEET_LOCK}))`);
    const rows = await tx.select({ value: appState.value }).from(appState).where(eq(appState.key, SHEET_KEY));
    const current = (rows[0]?.value || null) as LotSheet | null;
    const next = applyLotSheetOpsToSheet(current, ops);
    const written = await tx
      .insert(appState)
      .values({ key: SHEET_KEY, value: next, updatedAt: sql`now()` })
      .onConflictDoUpdate({ target: appState.key, set: { value: next, updatedAt: sql`now()` } })
      .returning({ updatedAt: appState.updatedAt });
    const records: LotSheetOpRecord[] = [];
    for (const op of ops) {
      const inserted = await tx.insert(lotSheetOps).values({ op, actor: actor || null }).returning();
      const row = inserted[0];
      records.push({
        revision: Number(row.revision),
        op: row.op as LotSheetOp,
        actor: row.actor || undefined,
        createdAt: isoOrNull(row.createdAt),
      });
    }
    return {
      sheet: next,
      updatedAt: isoOrNull(written[0]?.updatedAt) || new Date().toISOString(),
      revision: records[records.length - 1]?.revision || 0,
      ops: records,
    };
  });
  await bumpPulse(db);
  return result;
}

export async function listSheetOpsSince(since: number): Promise<LotSheetOpRecord[]> {
  const n = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0;
  const db = await getDb();
  const rows = await db
    .select()
    .from(lotSheetOps)
    .where(gt(lotSheetOps.revision, n))
    .orderBy(asc(lotSheetOps.revision))
    .limit(500);
  return rows.map((row) => ({
    revision: Number(row.revision),
    op: row.op as LotSheetOp,
    actor: row.actor || undefined,
    createdAt: isoOrNull(row.createdAt),
  }));
}

export async function listLatestSheetOps(limit = 200): Promise<LotSheetOpRecord[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const db = await getDb();
  const rows = await db.select().from(lotSheetOps).orderBy(desc(lotSheetOps.revision)).limit(n);
  return rows
    .map((row) => ({
      revision: Number(row.revision),
      op: row.op as LotSheetOp,
      actor: row.actor || undefined,
      createdAt: isoOrNull(row.createdAt),
    }))
    .reverse();
}

// ---------- generic keyed state (fuel, def, turnover, workpick, employees…) ----------
export async function getState(key: string): Promise<{ value: unknown; updatedAt: string | null }> {
  const db = await getDb();
  const rows = await db.select({ value: appState.value, updatedAt: appState.updatedAt }).from(appState).where(eq(appState.key, key));
  if (!rows.length) return { value: null, updatedAt: null };
  return { value: rows[0].value ?? null, updatedAt: isoOrNull(rows[0].updatedAt) };
}

export async function setState(key: string, value: unknown): Promise<string> {
  const db = await getDb();
  const rows = await db
    .insert(appState)
    .values({ key, value, updatedAt: sql`now()` })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: sql`now()` } })
    .returning({ updatedAt: appState.updatedAt });
  await bumpPulse(db);
  return isoOrNull(rows[0]?.updatedAt) || new Date().toISOString();
}

// ---------- Prev Sheets (archive) ----------
const HISTORY_LIMIT = 20;
const WORKORDER_LIMIT = 500; // work orders are a searchable long-term archive
function historyLimit(key: string): number {
  return key === "workorder" ? WORKORDER_LIMIT : HISTORY_LIMIT;
}

export interface HistoryEntry {
  id: string;
  sheet: unknown;
  savedAt: string | null;
}

export interface AuditEvent {
  id: string;
  kind: string;
  actor?: string;
  details: unknown;
  createdAt: string | null;
}

export async function recordAuditEvent(kind: string, details: unknown, actor = ""): Promise<void> {
  const db = await getDb();
  await db.insert(auditEvents).values({ kind, actor: actor || null, details: details ?? null });
}

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const db = await getDb();
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(n);
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.kind,
    actor: row.actor || undefined,
    details: row.details ?? null,
    createdAt: isoOrNull(row.createdAt),
  }));
}

const historyKey = sql`COALESCE(${sheetHistory.sheetKey}, 'lot')`;

// Newest first, scoped to one sheet (lot / fuel / def / …).
export async function listHistory(key = "lot"): Promise<HistoryEntry[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(sheetHistory)
    .where(eq(historyKey, key))
    .orderBy(desc(sheetHistory.savedAt), desc(sheetHistory.id))
    .limit(historyLimit(key));
  return rows.map((r) => ({ id: String(r.id), sheet: r.data ?? null, savedAt: isoOrNull(r.savedAt) }));
}

// Archive a sheet under its key, then trim that key to the newest N.
export async function archiveSheet(key: string, sheet: unknown): Promise<string> {
  const db = await getDb();
  const inserted = await db.insert(sheetHistory).values({ data: sheet, sheetKey: key }).returning({ id: sheetHistory.id });
  await db.execute(sql`
    DELETE FROM ${sheetHistory} WHERE COALESCE(sheet_key, 'lot') = ${key} AND id NOT IN (
      SELECT id FROM ${sheetHistory} WHERE COALESCE(sheet_key, 'lot') = ${key}
      ORDER BY saved_at DESC, id DESC LIMIT ${historyLimit(key)}
    )`);
  return String(inserted[0].id);
}

export async function deleteHistory(id: string): Promise<void> {
  const db = await getDb();
  const n = Number(id);
  if (Number.isFinite(n)) await db.delete(sheetHistory).where(eq(sheetHistory.id, n));
}

// ---------- cached PDF (stored in app_state under a per-sheet key) ----------
export interface PdfCache {
  signature: string;
  data: string;
}
function pdfKey(sheetPath: string | null | undefined, maint: boolean): string {
  const slug = !sheetPath || sheetPath === "/" ? "lot" : sheetPath.replace(/\W+/g, "");
  return `pdf_${slug}_${maint ? 1 : 0}`;
}

export async function getPdfCache(sheetPath: string, maint: boolean): Promise<PdfCache | null> {
  const { value } = await getState(pdfKey(sheetPath, maint));
  return (value as PdfCache) || null;
}

export async function setPdfCache(sheetPath: string, maint: boolean, signature: string, data: string): Promise<void> {
  await setState(pdfKey(sheetPath, maint), { signature, data } satisfies PdfCache);
}
