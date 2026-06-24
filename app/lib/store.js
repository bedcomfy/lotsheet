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

import { promises as fs } from "fs";
import path from "path";

// Vercel/Neon set one of these depending on the integration used.
const PG_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const usePg = !!PG_URL;

const DATA_DIR = path.join(process.cwd(), ".data");
const FLAGS_FILE = path.join(DATA_DIR, "flags.json");
const SHEET_FILE = path.join(DATA_DIR, "sheet.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

// Normalise a stored miles value to an integer or null.
function toMiles(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// Normalise any stored shape (old string, old array, or new object) to an entry.
function toEntry(v) {
  if (!v) return { flags: [], note: "", inspMiles: null };
  if (Array.isArray(v)) return { flags: v.filter(Boolean), note: "", inspMiles: null };
  if (typeof v === "string") return { flags: v.split(",").filter(Boolean), note: "", inspMiles: null };
  return {
    flags: Array.isArray(v.flags) ? v.flags.filter(Boolean) : [],
    note: typeof v.note === "string" ? v.note : "",
    inspMiles: toMiles(v.inspMiles),
  };
}
function isEmpty(e) {
  return !e.flags.length && !(e.note && e.note.trim());
}

// ---------- local JSON file backend (dev) ----------
async function fileRead() {
  try {
    return JSON.parse(await fs.readFile(FLAGS_FILE, "utf8"));
  } catch {
    return {};
  }
}
async function fileWrite(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FLAGS_FILE, JSON.stringify(data, null, 2));
}

// ---------- Postgres backend (prod) ----------
let _pool;
async function pool() {
  if (!_pool) {
    const { Pool } = await import("pg");
    _pool = new Pool({
      connectionString: PG_URL,
      ssl: { rejectUnauthorized: false },
    });
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS bus_flags (
        bus TEXT PRIMARY KEY,
        flag TEXT,
        note TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    await _pool.query(`ALTER TABLE bus_flags ADD COLUMN IF NOT EXISTS note TEXT`);
    await _pool.query(`ALTER TABLE bus_flags ADD COLUMN IF NOT EXISTS insp_miles INTEGER`);
    // Generic key/value store for shared app state (currently the lot sheet).
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMPTZ DEFAULT now()
      )`
    );
    // Archive of past/erased sheets (Prev Sheets), capped at 20 newest rows.
    await _pool.query(
      `CREATE TABLE IF NOT EXISTS sheet_history (
        id BIGSERIAL PRIMARY KEY,
        data JSONB,
        saved_at TIMESTAMPTZ DEFAULT now()
      )`
    );
  }
  return _pool;
}

// ---------- public API ----------
// Returns { [busNumber]: { flags: [...], note } } for buses that have content.
export async function getFlags() {
  const out = {};
  if (usePg) {
    const { rows } = await (await pool()).query("SELECT bus, flag, note, insp_miles FROM bus_flags");
    for (const r of rows) {
      const e = toEntry({
        flags: (r.flag || "").split(",").filter(Boolean),
        note: r.note || "",
        inspMiles: r.insp_miles,
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

export async function setBusFlags(bus, entry) {
  const e = toEntry(entry);
  if (usePg) {
    const db = await pool();
    if (isEmpty(e)) {
      await db.query("DELETE FROM bus_flags WHERE bus = $1", [bus]);
    } else {
      await db.query(
        `INSERT INTO bus_flags (bus, flag, note, insp_miles, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (bus) DO UPDATE SET flag = $2, note = $3, insp_miles = $4, updated_at = now()`,
        [bus, e.flags.join(","), e.note, e.inspMiles]
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

export async function getSheet() {
  if (usePg) {
    const { rows } = await (await pool()).query(
      "SELECT value, updated_at FROM app_state WHERE key = $1",
      [SHEET_KEY]
    );
    if (!rows.length) return { sheet: null, updatedAt: null };
    return {
      sheet: rows[0].value || null,
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
    };
  }
  try {
    const raw = JSON.parse(await fs.readFile(SHEET_FILE, "utf8"));
    return { sheet: raw.sheet || null, updatedAt: raw.updatedAt || null };
  } catch {
    return { sheet: null, updatedAt: null };
  }
}

export async function setSheet(sheet) {
  const updatedAt = new Date().toISOString();
  if (usePg) {
    await (await pool()).query(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
       RETURNING updated_at`,
      [SHEET_KEY, sheet]
    );
    // Read back the canonical timestamp so all devices agree.
    const { rows } = await (await pool()).query(
      "SELECT updated_at FROM app_state WHERE key = $1",
      [SHEET_KEY]
    );
    return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : updatedAt;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SHEET_FILE, JSON.stringify({ sheet, updatedAt }, null, 2));
  return updatedAt;
}

// ---------- Prev Sheets (archive of past/erased sheets) ----------
const HISTORY_LIMIT = 20;

async function historyFileRead() {
  try {
    const arr = JSON.parse(await fs.readFile(HISTORY_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function historyFileWrite(list) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(list, null, 2));
}

// Newest first: [{ id, sheet, savedAt }]. At most HISTORY_LIMIT entries.
export async function listHistory() {
  if (usePg) {
    const { rows } = await (await pool()).query(
      "SELECT id, data, saved_at FROM sheet_history ORDER BY saved_at DESC, id DESC LIMIT $1",
      [HISTORY_LIMIT]
    );
    return rows.map((r) => ({
      id: String(r.id),
      sheet: r.data || null,
      savedAt: r.saved_at ? new Date(r.saved_at).toISOString() : null,
    }));
  }
  const list = await historyFileRead();
  return list.slice(0, HISTORY_LIMIT);
}

// Archive a sheet, then trim to the newest HISTORY_LIMIT.
export async function archiveSheet(sheet) {
  const savedAt = new Date().toISOString();
  if (usePg) {
    const db = await pool();
    const { rows } = await db.query(
      "INSERT INTO sheet_history (data) VALUES ($1) RETURNING id",
      [sheet]
    );
    await db.query(
      `DELETE FROM sheet_history WHERE id NOT IN (
        SELECT id FROM sheet_history ORDER BY saved_at DESC, id DESC LIMIT $1
      )`,
      [HISTORY_LIMIT]
    );
    return String(rows[0].id);
  }
  const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const list = await historyFileRead();
  list.unshift({ id, sheet, savedAt });
  await historyFileWrite(list.slice(0, HISTORY_LIMIT));
  return id;
}

export async function deleteHistory(id) {
  if (usePg) {
    await (await pool()).query("DELETE FROM sheet_history WHERE id = $1", [id]);
    return;
  }
  const list = await historyFileRead();
  await historyFileWrite(list.filter((h) => String(h.id) !== String(id)));
}

// ---------- cached PDF (so "Print PDF" is instant) ----------
// Stores the generated PDF (base64) keyed by maintenance variant, with a
// signature of the sheet+flags it was built from. One key per maint variant.
function pdfKey(maint) {
  return `pdf_${maint ? 1 : 0}`;
}
function pdfFile(maint) {
  return path.join(DATA_DIR, `${pdfKey(maint)}.json`);
}

export async function getPdfCache(maint) {
  const key = pdfKey(maint);
  if (usePg) {
    const { rows } = await (await pool()).query("SELECT value FROM app_state WHERE key = $1", [key]);
    return rows.length ? rows[0].value : null;
  }
  try {
    return JSON.parse(await fs.readFile(pdfFile(maint), "utf8"));
  } catch {
    return null;
  }
}

export async function setPdfCache(maint, signature, data) {
  const value = { signature, data };
  if (usePg) {
    await (await pool()).query(
      `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [pdfKey(maint), value]
    );
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(pdfFile(maint), JSON.stringify(value));
}
