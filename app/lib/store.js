// Shared storage for manager-set bus flags. Each bus entry is
//   { flags: [flagId, ...], note: "custom issue text" }
// A bus can have several flags plus an optional free-text note ("Other").
//
// Dev (no DATABASE_URL): a local JSON file under .data/. Production
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

// Normalise any stored shape (old string, old array, or new object) to an entry.
function toEntry(v) {
  if (!v) return { flags: [], note: "" };
  if (Array.isArray(v)) return { flags: v.filter(Boolean), note: "" };
  if (typeof v === "string") return { flags: v.split(",").filter(Boolean), note: "" };
  return {
    flags: Array.isArray(v.flags) ? v.flags.filter(Boolean) : [],
    note: typeof v.note === "string" ? v.note : "",
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
  }
  return _pool;
}

// ---------- public API ----------
// Returns { [busNumber]: { flags: [...], note } } for buses that have content.
export async function getFlags() {
  const out = {};
  if (usePg) {
    const { rows } = await (await pool()).query("SELECT bus, flag, note FROM bus_flags");
    for (const r of rows) {
      const e = toEntry({ flags: (r.flag || "").split(",").filter(Boolean), note: r.note || "" });
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
        `INSERT INTO bus_flags (bus, flag, note, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (bus) DO UPDATE SET flag = $2, note = $3, updated_at = now()`,
        [bus, e.flags.join(","), e.note]
      );
    }
    return;
  }
  const data = await fileRead();
  if (isEmpty(e)) delete data[bus];
  else data[bus] = e;
  await fileWrite(data);
}
