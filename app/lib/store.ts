// Shared storage for manager-set bus flags AND the shared "current" Lot Sheet,
// plus the hub sheets, history, audit log and cached PDFs.
//
// One typed data layer (Drizzle) over Postgres — Neon in production, an embedded
// PGlite database in local dev (see ./db). The API surface below is unchanged;
// callers don't know or care which database is behind it.

import { and, asc, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { getDb } from "./db";
import type { DB } from "./db";
import { appState, auditEvents, busFlags, lotSheetOps, pmInspections, pmMileage, pmMileageLog, sheetHistory, TABLE_SUFFIX } from "./db/schema";
import {
  applyLotSheetOpsToSheet,
  normalizeOpEnvelopes,
  type LotSheetOp,
  type LotSheetOpRecord,
} from "./lotSheetOps";
import type { BusMaster, FlagEntry, FlagMap, LotSheet } from "./types";
import {
  applyCompletion,
  emptyPmRecord,
  isInspectionType,
  isPmFleetBus,
  nextInspection,
  normalizeDisposition,
  normalizePmSettings,
  toMiles as toPmMiles,
  transNextDue,
  type PmCompletion,
  type PmKind,
  type PmReading,
  type PmRecord,
  type PmSettings,
} from "./pmMileage";
import { inspectionOptionFromText, removeInspection, setInspectionOption } from "./grid";
import { DEFAULT_MASTER, normalizeBusMaster } from "./buses";
import { chicagoDateShort } from "./chicagoTime";
import { pmScheduleToken, type PmInspectionEntry } from "./pmHistory";
export type { PmInspectionEntry } from "./pmHistory";

// Shared by the database and a transaction, so status and flag writes commit together.
type StoreWriter = Pick<DB, "select" | "insert" | "delete" | "execute">;

// ---------- flag-entry normalisation (unchanged) ----------
function toMiles(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

const EMPTY_ENTRY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", cardsReason: "", retorqueTires: [], inspOption: "" };

// Normalise any stored shape (old string, old array, or new object) to an entry.
function toEntry(v: unknown): FlagEntry {
  if (!v) return { ...EMPTY_ENTRY };
  if (Array.isArray(v)) return { ...EMPTY_ENTRY, flags: v.filter(Boolean) };
  if (typeof v === "string") return { ...EMPTY_ENTRY, flags: v.split(",").filter(Boolean) };
  const o = v as Record<string, unknown>;
  let flags: string[] = Array.isArray(o.flags) ? o.flags.filter(Boolean) : [];
  const holdReason = flags.includes("hold") && typeof o.holdReason === "string" ? o.holdReason : "";
  const cardsReason = flags.includes("cards") && typeof o.cardsReason === "string" ? o.cardsReason : "";
  const retorqueTires = flags.includes("retorque") && Array.isArray(o.retorqueTires) ? o.retorqueTires.filter(Boolean) : [];
  // A retorque needs a tire (a hold can stand on its own, reason optional).
  if (flags.includes("retorque") && retorqueTires.length === 0) flags = flags.filter((f) => f !== "retorque");
  const inspOption = flags.includes("inspection") && typeof o.inspOption === "string" ? o.inspOption.trim() : "";
  const entry: FlagEntry = {
    flags,
    note: typeof o.note === "string" ? o.note : "",
    inspMiles: toMiles(o.inspMiles),
    holdReason,
    cardsReason,
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
async function bumpPulse(db: StoreWriter): Promise<void> {
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
      cardsReason: r.cardsReason || "",
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
      cardsReason: e.cardsReason,
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

export async function applySheetOps(
  rawOps: unknown,
  actor = ""
): Promise<{
  sheet: LotSheet;
  updatedAt: string;
  revision: number;
  ops: LotSheetOpRecord[];
  applied: number;
  duplicateOpIds: string[];
}> {
  const envelopes = normalizeOpEnvelopes(rawOps);
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${SHEET_LOCK}))`);
    const rows = await tx
      .select({ value: appState.value, updatedAt: appState.updatedAt })
      .from(appState)
      .where(eq(appState.key, SHEET_KEY));
    const current = (rows[0]?.value || null) as LotSheet | null;
    const candidateIds = [...new Set(envelopes.map((entry) => entry.opId).filter((id): id is string => !!id))];
    const existingIds = new Set<string>();
    if (candidateIds.length) {
      const existing = await tx
        .select({ opId: lotSheetOps.opId })
        .from(lotSheetOps)
        .where(inArray(lotSheetOps.opId, candidateIds));
      for (const row of existing) {
        if (row.opId) existingIds.add(row.opId);
      }
    }
    const batchIds = new Set<string>();
    const duplicateOpIds: string[] = [];
    const pending = envelopes.filter((entry) => {
      if (!entry.opId) return true;
      if (existingIds.has(entry.opId) || batchIds.has(entry.opId)) {
        duplicateOpIds.push(entry.opId);
        return false;
      }
      batchIds.add(entry.opId);
      return true;
    });
    const ops = pending.map((entry) => entry.op);
    const next = applyLotSheetOpsToSheet(current, ops);
    let updatedAt = isoOrNull(rows[0]?.updatedAt) || new Date().toISOString();
    if (pending.length) {
      const written = await tx
        .insert(appState)
        .values({ key: SHEET_KEY, value: next, updatedAt: sql`now()` })
        .onConflictDoUpdate({ target: appState.key, set: { value: next, updatedAt: sql`now()` } })
        .returning({ updatedAt: appState.updatedAt });
      updatedAt = isoOrNull(written[0]?.updatedAt) || updatedAt;
    }
    const records: LotSheetOpRecord[] = [];
    for (const entry of pending) {
      const inserted = await tx
        .insert(lotSheetOps)
        .values({ opId: entry.opId || null, op: entry.op, actor: actor || null })
        .returning();
      const row = inserted[0];
      records.push({
        revision: Number(row.revision),
        opId: row.opId || undefined,
        op: row.op as LotSheetOp,
        actor: row.actor || undefined,
        createdAt: isoOrNull(row.createdAt),
      });
    }
    const latest =
      records[records.length - 1]?.revision ||
      Number((await tx.select({ revision: max(lotSheetOps.revision) }).from(lotSheetOps))[0]?.revision || 0);
    return {
      sheet: next,
      updatedAt,
      revision: latest,
      ops: records,
      applied: pending.length,
      duplicateOpIds,
    };
  });
  if (result.applied) await bumpPulse(db);
  return result;
}

export async function listSheetOpsSince(since: number, limit = 500): Promise<LotSheetOpRecord[]> {
  const n = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0;
  const pageSize = Math.max(1, Math.min(500, Math.floor(limit)));
  const db = await getDb();
  const rows = await db
    .select()
    .from(lotSheetOps)
    .where(gt(lotSheetOps.revision, n))
    .orderBy(asc(lotSheetOps.revision))
    .limit(pageSize);
  return rows.map((row) => ({
    revision: Number(row.revision),
    opId: row.opId || undefined,
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
      opId: row.opId || undefined,
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
  const updatedAt = await writeState(db, key, value);
  await bumpPulse(db);
  return updatedAt;
}

// Same write, no pulse — for server-side caches (PDFs) that no client needs to
// refetch for. Bumping the pulse there woke every device after every prewarm.
export async function setStateQuiet(key: string, value: unknown): Promise<string> {
  const db = await getDb();
  return writeState(db, key, value);
}

async function writeState(db: DB, key: string, value: unknown): Promise<string> {
  const rows = await db
    .insert(appState)
    .values({ key, value, updatedAt: sql`now()` })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: sql`now()` } })
    .returning({ updatedAt: appState.updatedAt });
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
  await setStateQuiet(pdfKey(sheetPath, maint), { signature, data } satisfies PdfCache);
}

// ---------- PM mileage ----------
const PM_SETTINGS_KEY = "pm_settings";

function pmRowToRecord(row: typeof pmMileage.$inferSelect): PmRecord {
  return {
    bus: row.bus,
    odometer: row.odometer ?? null,
    odometerDate: row.odometerDate || null,
    lastServiceAt: row.lastServiceAt || null,
    lastServiceMiles: row.lastServiceMiles ?? null,
    lastInspType: isInspectionType(row.lastInspType) ? row.lastInspType : null,
    lastInspMiles: row.lastInspMiles ?? null,
    lastInspDate: row.lastInspDate || null,
    lastTransMiles: row.lastTransMiles ?? null,
    lastTransDate: row.lastTransDate || null,
    nextInspType: isInspectionType(row.nextInspType) ? row.nextInspType : null,
    nextInspMiles: row.nextInspMiles ?? null,
    nextTransMiles: row.nextTransMiles ?? null,
    disposition: normalizeDisposition(row.disposition),
    note: row.note || "",
    source: row.source || "",
    updatedAt: isoOrNull(row.updatedAt),
  };
}

function pmRecordToRow(r: PmRecord) {
  return {
    odometer: r.odometer,
    odometerDate: r.odometerDate,
    lastServiceAt: r.lastServiceAt,
    lastServiceMiles: r.lastServiceMiles,
    lastInspType: r.lastInspType,
    lastInspMiles: r.lastInspMiles,
    lastInspDate: r.lastInspDate,
    lastTransMiles: r.lastTransMiles,
    lastTransDate: r.lastTransDate,
    nextInspType: r.nextInspType,
    nextInspMiles: r.nextInspMiles,
    nextTransMiles: r.nextTransMiles,
    disposition: r.disposition || null,
    note: r.note,
    source: r.source,
    updatedAt: sql`now()`,
  };
}

async function writePmRecord(db: StoreWriter, next: PmRecord, fields: string[]): Promise<PmRecord> {
  const row = pmRecordToRow(next);
  // Update only the requested columns: a simultaneous crew status edit must
  // survive an admin mileage edit or completion based on an older record.
  const set = Object.fromEntries(Object.entries(row).filter(([key]) => fields.includes(key) || key === "updatedAt"));
  const rows = await db
    .insert(pmMileage)
    .values({ bus: next.bus, ...row })
    .onConflictDoUpdate({ target: pmMileage.bus, set })
    .returning();
  return pmRowToRecord(rows[0]);
}

async function logOdometerIfChanged(db: StoreWriter, before: PmRecord, next: PmRecord, actor: string): Promise<void> {
  if (next.odometer !== null && next.odometer !== before.odometer) {
    await db.insert(pmMileageLog).values({
      bus: next.bus,
      odometer: next.odometer,
      readAt: next.odometerDate,
      source: next.source || "manual",
      batch: null,
      actor: actor || null,
    });
  }
}

export async function getPmSettings(): Promise<PmSettings> {
  return normalizePmSettings((await getState(PM_SETTINGS_KEY)).value);
}

export async function setPmSettings(value: unknown): Promise<PmSettings> {
  const settings = normalizePmSettings(value);
  await setState(PM_SETTINGS_KEY, settings);
  return settings;
}

export async function getPmMileage(): Promise<Record<string, PmRecord>> {
  const db = await getDb();
  const rows = await db.select().from(pmMileage);
  const out: Record<string, PmRecord> = {};
  for (const row of rows) out[row.bus] = pmRowToRecord(row);
  return out;
}

async function readPmRecord(db: StoreWriter, bus: string): Promise<PmRecord> {
  const existing = (await db.select().from(pmMileage).where(eq(pmMileage.bus, bus)))[0];
  return existing ? pmRowToRecord(existing) : emptyPmRecord(bus);
}

// Miles may arrive as typed text ("123,456"); dates and notes as text or null.
export interface PmPatch {
  odometer?: number | string | null;
  odometerDate?: string | null;
  lastInspType?: string | null;
  lastInspMiles?: number | string | null;
  lastInspDate?: string | null;
  lastTransMiles?: number | string | null;
  lastTransDate?: string | null;
  nextInspType?: string | null;
  nextInspMiles?: number | null;
  nextTransMiles?: number | null;
  disposition?: string | null;
  note?: string;
  source?: string;
}

const textOrNull = (v: string | null | undefined) => (v ? String(v).trim() || null : null);

// Merge a patch into one bus's record. A changed odometer is also appended to
// the reading log so reports can show history.
export async function updatePmMileage(bus: string, patch: PmPatch, actor = ""): Promise<PmRecord> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const record = await patchPmRecord(tx, bus, patch, actor);
    if (patch.disposition !== undefined && (record.disposition === "hold" || record.disposition === "split")) {
      const flag = record.disposition;
      // Add at the database row, never rewrite a fetched flag entry. Concurrent
      // flags and all reason/inspection/note fields survive this narrow update.
      // Operational flags are cleared explicitly, not by changing PM status.
      await tx.insert(busFlags).values({ bus, flag, updatedAt: sql`now()` }).onConflictDoUpdate({
        target: busFlags.bus,
        set: {
          flag: sql`CASE WHEN ${flag} = ANY(string_to_array(COALESCE(${busFlags.flag}, ''), ','))
            THEN ${busFlags.flag} ELSE concat_ws(',', NULLIF(${busFlags.flag}, ''), ${flag}::text) END`,
          updatedAt: sql`now()`,
        },
      });
    }
    await bumpPulse(tx);
    return record;
  });
}

async function patchPmRecord(db: StoreWriter, bus: string, patch: PmPatch, actor: string): Promise<PmRecord> {
  const before = await readPmRecord(db, bus);
  const fields = Object.keys(patch);
  // Explicitly correcting the historical PM resumes the schedule derived
  // from that correction. A next-due edit, in contrast, leaves history alone.
  if (patch.lastInspType !== undefined || patch.lastInspMiles !== undefined) {
    patch = { nextInspType: null, nextInspMiles: null, ...patch };
    fields.push("nextInspType", "nextInspMiles");
  }
  if (patch.lastTransMiles !== undefined) {
    patch = { nextTransMiles: null, ...patch };
    fields.push("nextTransMiles");
  }
  if (patch.odometer !== undefined) fields.push("source");
  const next: PmRecord = {
    ...before,
    ...(patch.odometer !== undefined ? { odometer: toPmMiles(patch.odometer) } : {}),
    ...(patch.odometerDate !== undefined ? { odometerDate: textOrNull(patch.odometerDate) } : {}),
    ...(patch.lastInspType !== undefined ? { lastInspType: isInspectionType(patch.lastInspType) ? patch.lastInspType : null } : {}),
    ...(patch.lastInspMiles !== undefined ? { lastInspMiles: toPmMiles(patch.lastInspMiles) } : {}),
    ...(patch.lastInspDate !== undefined ? { lastInspDate: textOrNull(patch.lastInspDate) } : {}),
    ...(patch.lastTransMiles !== undefined ? { lastTransMiles: toPmMiles(patch.lastTransMiles) } : {}),
    ...(patch.lastTransDate !== undefined ? { lastTransDate: textOrNull(patch.lastTransDate) } : {}),
    ...(patch.nextInspType !== undefined ? { nextInspType: isInspectionType(patch.nextInspType) ? patch.nextInspType : null } : {}),
    ...(patch.nextInspMiles !== undefined ? { nextInspMiles: toPmMiles(patch.nextInspMiles) } : {}),
    ...(patch.nextTransMiles !== undefined ? { nextTransMiles: toPmMiles(patch.nextTransMiles) } : {}),
    ...(patch.disposition !== undefined ? { disposition: normalizeDisposition(patch.disposition) } : {}),
    ...(patch.note !== undefined ? { note: String(patch.note ?? "").trim() } : {}),
    source: patch.source ?? (patch.odometer !== undefined ? "manual" : before.source),
  };
  const saved = await writePmRecord(db, next, fields);
  if (patch.odometer !== undefined) await logOdometerIfChanged(db, before, saved, actor);
  return saved;
}

export class PmConflictError extends Error {}

function pmScheduleFields(kind: PmKind): string[] {
  return kind === "inspection"
    ? ["lastInspType", "lastInspMiles", "lastInspDate", "nextInspType", "nextInspMiles"]
    : ["lastTransMiles", "lastTransDate", "nextTransMiles"];
}

interface CompletionOptions {
  requestId: string;
  expectedSchedule: string;
  completedAt: string;
  foremanSr?: string;
  clearFlag: boolean;
  admin: boolean;
}

// Lock the bus, check the schedule the crew saw, then commit the schedule,
// completion receipt, optional flag removal, and audit together. A retry of
// the same request never advances the inspection cycle a second time.
export async function completePm(
  bus: string,
  completion: PmCompletion,
  actor: string,
  options: CompletionOptions,
): Promise<{ before: PmRecord; after: PmRecord; flagCleared: boolean }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [master] = await tx.select().from(appState).where(eq(appState.key, "bus_master"));
    const fleet = normalizeBusMaster((master?.value as BusMaster | null) || DEFAULT_MASTER).buses;
    if (!fleet.some((item) => item.num === bus && isPmFleetBus(item))) throw new PmConflictError("This bus is not in the PM fleet.");
    await tx.insert(pmMileage).values({ bus }).onConflictDoNothing();
    const [row] = await tx.select().from(pmMileage).where(eq(pmMileage.bus, bus)).for("update");
    const before = pmRowToRecord(row);
    const [duplicate] = await tx.select().from(pmInspections).where(eq(pmInspections.requestId, options.requestId));
    if (duplicate) {
      if (duplicate.bus !== bus || duplicate.kind !== completion.kind || duplicate.undoneAt) throw new PmConflictError("This completion request has already been used. Refresh the PM page.");
      return { before, after: before, flagCleared: Boolean(duplicate.clearedFlag) };
    }
    if (pmScheduleToken(before, completion.kind) !== options.expectedSchedule) throw new PmConflictError("This PM changed while you were confirming. Close this window and refresh the PM page.");
    const scheduled = nextInspection(before);
    const due = completion.kind === "inspection" ? scheduled?.miles ?? null : transNextDue(before);
    if (!options.admin && (due === null || (completion.kind === "inspection" && completion.type && completion.type !== scheduled?.type))) {
      throw new PmConflictError("Only the scheduled PM can be completed here. Ask an admin to correct its schedule first.");
    }
    const completedAt = new Date(options.completedAt);
    const foremanSr = options.foremanSr?.trim() || null;
    const date = chicagoDateShort(completedAt);
    const next = applyCompletion(before, { ...completion, date });
    const fields = pmScheduleFields(completion.kind);
    if (next.odometer !== before.odometer) fields.push("odometer", "odometerDate");
    const after = await writePmRecord(tx, next, fields);
    let clearedFlag: FlagEntry | null = null;
    if (completion.kind === "inspection" && options.clearFlag) {
      const [flagRow] = await tx.select().from(busFlags).where(eq(busFlags.bus, bus)).for("update");
      if (flagRow?.flag?.split(",").includes("inspection")) {
        clearedFlag = toEntry({ ...flagRow, flags: flagRow.flag.split(","), retorqueTires: flagRow.retorqueTires?.split(",") || [] });
        await tx.update(busFlags).set({ flag: removeInspection(clearedFlag).flags.join(","), inspOption: "", inspMiles: null, updatedAt: sql`now()` }).where(eq(busFlags.bus, bus));
      }
    }
    const [entry] = await tx.insert(pmInspections).values({
      bus, kind: completion.kind, type: completion.kind === "inspection" ? after.lastInspType : null,
      miles: (completion.kind === "inspection" ? after.lastInspMiles : after.lastTransMiles)!,
      odometer: completion.miles, doneAt: date, completedAt, requestId: options.requestId,
      foremanSr,
      beforeState: before, afterState: after, clearedFlag, actor: actor || null,
    }).returning({ id: pmInspections.id });
    await logOdometerIfChanged(tx, before, after, actor);
    await tx.insert(auditEvents).values({ kind: "pm_complete", actor, details: { id: String(entry.id), bus, kind: completion.kind, completedAt: options.completedAt, foremanSr, odometer: completion.miles, flagCleared: Boolean(clearedFlag) } });
    await bumpPulse(tx);
    return { before, after, flagCleared: Boolean(clearedFlag) };
  });
}

type InspectionRow = typeof pmInspections.$inferSelect;
function undoReason(row: InspectionRow, current: PmRecord, latestId: number | undefined): string | null {
  if (row.undoneAt) return "This completion was undone.";
  if (!row.beforeState || !row.afterState) return "Undo is unavailable for older records without a saved prior schedule.";
  if (row.id !== latestId) return "Undo the newer completion of this PM first.";
  if (pmScheduleToken(current, row.kind as PmKind) !== pmScheduleToken(row.afterState, row.kind as PmKind)) return "This PM schedule has been edited since completion. Ask an admin to review it.";
  return null;
}

async function mapPmInspections(rows: InspectionRow[]): Promise<PmInspectionEntry[]> {
  const db = await getDb();
  const [records, latest] = await Promise.all([
    getPmMileage(),
    db.selectDistinctOn([pmInspections.bus, pmInspections.kind]).from(pmInspections).where(isNull(pmInspections.undoneAt))
      .orderBy(asc(pmInspections.bus), asc(pmInspections.kind), desc(pmInspections.id)),
  ]);
  const ids = new Map(latest.map((item) => [`${item.bus}:${item.kind}`, item.id]));
  return rows.map((row) => {
    const reason = undoReason(row, records[row.bus] || emptyPmRecord(row.bus), ids.get(`${row.bus}:${row.kind}`));
    return { id: String(row.id), bus: row.bus, kind: row.kind as PmKind, type: row.type || null,
      miles: row.miles, odometer: row.odometer, doneAt: row.doneAt || null, completedAt: isoOrNull(row.completedAt),
      foremanSr: row.foremanSr || null,
      actor: row.actor || undefined, createdAt: isoOrNull(row.createdAt), undoneAt: isoOrNull(row.undoneAt),
      canUndo: reason === null, undoReason: reason };
  });
}

export async function listPmInspections(bus?: string, limit = 200): Promise<PmInspectionEntry[]> {
  const n = Math.max(1, Math.min(2000, Math.floor(limit)));
  const db = await getDb();
  const base = db.select().from(pmInspections);
  const rows = await (bus ? base.where(eq(pmInspections.bus, bus)) : base).orderBy(desc(pmInspections.id)).limit(n);
  return mapPmInspections(rows);
}

export async function latestPmInspections(): Promise<PmInspectionEntry[]> {
  const db = await getDb();
  const rows = await db.selectDistinctOn([pmInspections.bus, pmInspections.kind]).from(pmInspections)
    .where(isNull(pmInspections.undoneAt)).orderBy(asc(pmInspections.bus), asc(pmInspections.kind), desc(pmInspections.id));
  return mapPmInspections(rows);
}

export async function undoPmInspection(id: number, actor = ""): Promise<PmRecord> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(pmInspections).where(eq(pmInspections.id, id));
    if (!found) throw new PmConflictError("This completion could not be found.");
    const [row] = await tx.select().from(pmMileage).where(eq(pmMileage.bus, found.bus)).for("update");
    if (!row) throw new PmConflictError("This bus no longer has a PM record.");
    const current = pmRowToRecord(row);
    const [entry] = await tx.select().from(pmInspections).where(eq(pmInspections.id, id));
    if (entry.undoneAt) return current;
    const [latest] = await tx.select().from(pmInspections).where(and(eq(pmInspections.bus, entry.bus), eq(pmInspections.kind, entry.kind), isNull(pmInspections.undoneAt))).orderBy(desc(pmInspections.id)).limit(1);
    const reason = undoReason(entry, current, latest?.id);
    if (reason) throw new PmConflictError(reason);
    if (entry.clearedFlag) {
      await tx.insert(busFlags).values({ bus: entry.bus }).onConflictDoNothing();
      const [flags] = await tx.select().from(busFlags).where(eq(busFlags.bus, entry.bus)).for("update");
      const hasInspection = flags.flag?.split(",").includes("inspection");
      if (hasInspection && ((flags.inspOption || "") !== entry.clearedFlag.inspOption || flags.inspMiles !== entry.clearedFlag.inspMiles)) throw new PmConflictError("The inspection flag was changed after completion. Ask an admin to review it.");
      if (!hasInspection) {
        const restoredFlags = setInspectionOption({ ...entry.clearedFlag, flags: [...(flags.flag?.split(",").filter(Boolean) || []), "inspection"] }, entry.clearedFlag.inspOption);
        await tx.update(busFlags).set({ flag: restoredFlags.flags.join(","),
          inspOption: entry.clearedFlag.inspOption, inspMiles: entry.clearedFlag.inspMiles, updatedAt: sql`now()`,
        }).where(eq(busFlags.bus, entry.bus));
      }
    }
    // Only the selected PM is rewound. A confirmed odometer reading remains
    // valid even if the inspection was marked complete by mistake.
    const restored = await writePmRecord(tx, entry.beforeState!, pmScheduleFields(entry.kind as PmKind));
    await tx.update(pmInspections).set({ undoneAt: sql`now()`, undoneBy: actor }).where(eq(pmInspections.id, id));
    await tx.insert(auditEvents).values({ kind: "pm_completion_undo", actor, details: { id: String(id), bus: entry.bus, kind: entry.kind } });
    await bumpPulse(tx);
    return restored;
  });
}

// Apply a reviewed report. Odometer-only readings preserve both PM schedules;
// PM status reports also update the independent due marks they contain.
const SAME_PM_TOLERANCE = 500; // miles; the report's "done at" and the crew's reading differ a little

function samePm(typeA: string | null, milesA: number | null, typeB: string | null, milesB: number | null): boolean {
  return typeA === typeB && milesA !== null && milesB !== null && Math.abs(milesA - milesB) <= SAME_PM_TOLERANCE;
}

export async function applyPmReadings(
  readings: PmReading[],
  source: string,
  actor = "",
): Promise<{ batch: string; applied: string[] }> {
  const db = await getDb();
  const batch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const applied: string[] = [];
  for (const reading of readings) {
    const odometer = toPmMiles(reading.odometer);
    if (!reading.bus || odometer === null) continue;
    const readAt = reading.readAt || null;
    // A PM status report also says which inspection / trans PM was last
    // done; a plain mileage list leaves those alone. The report carries no
    // dates, so a date recorded on the site stays only while it still
    // describes the same PM (same type, mileage within a few hundred).
    const pm: Partial<typeof pmMileage.$inferInsert> = {};
    const existing = await readPmRecord(db, reading.bus);
    // Keep both schedules at the exact due mileages printed on the report.
    // An odometer-only report must not erase either schedule.
    const nextInspDue = toPmMiles(reading.nextInspDue);
    if (isInspectionType(reading.nextInspType) && nextInspDue !== null) {
      pm.nextInspType = reading.nextInspType;
      pm.nextInspMiles = nextInspDue;
    }
    const transDue = toPmMiles(reading.transDue);
    if (transDue !== null) pm.nextTransMiles = transDue;
    const lastInspMiles = toPmMiles(reading.lastInspMiles);
    if (isInspectionType(reading.lastInspType) && lastInspMiles !== null) {
      pm.lastInspType = reading.lastInspType;
      pm.lastInspMiles = lastInspMiles;
      if (!samePm(existing.lastInspType, existing.lastInspMiles, reading.lastInspType, lastInspMiles)) pm.lastInspDate = null;
    }
    const lastTransMiles = toPmMiles(reading.lastTransMiles);
    if (lastTransMiles !== null) {
      pm.lastTransMiles = lastTransMiles;
      if (!samePm("trans", existing.lastTransMiles, "trans", lastTransMiles)) pm.lastTransDate = null;
    }
    const set = { odometer, odometerDate: readAt, source, updatedAt: sql`now()`, ...pm };
    await db
      .insert(pmMileage)
      .values({ bus: reading.bus, ...set })
      .onConflictDoUpdate({ target: pmMileage.bus, set });
    await db.insert(pmMileageLog).values({
      bus: reading.bus,
      odometer,
      readAt,
      source,
      batch,
      actor: actor || null,
    });
    applied.push(reading.bus);
  }
  if (applied.length) await bumpPulse(db);
  return { batch, applied };
}

export interface PmLogEntry {
  id: string;
  bus: string;
  odometer: number;
  readAt: string | null;
  source: string;
  batch: string | null;
  actor?: string;
  createdAt: string | null;
}

export async function listPmMileageLog(bus?: string, limit = 200): Promise<PmLogEntry[]> {
  const n = Math.max(1, Math.min(2000, Math.floor(limit)));
  const db = await getDb();
  const base = db.select().from(pmMileageLog);
  const rows = await (bus ? base.where(eq(pmMileageLog.bus, bus)) : base).orderBy(desc(pmMileageLog.id)).limit(n);
  return rows.map((row) => ({
    id: String(row.id),
    bus: row.bus,
    odometer: row.odometer,
    readAt: row.readAt || null,
    source: row.source || "",
    batch: row.batch || null,
    actor: row.actor || undefined,
    createdAt: isoOrNull(row.createdAt),
  }));
}
