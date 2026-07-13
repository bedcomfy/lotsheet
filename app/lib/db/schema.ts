// Drizzle schema — the single typed source of truth for the database shape.
//
// These mirror the tables the app has always used. Non-production deployments
// write to env-suffixed tables (e.g. bus_flags_preview) so preview/development
// can never clobber production; the suffix is resolved once here at module load,
// exactly as the old raw-SQL store did.

import { bigserial, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const ENV = process.env.VERCEL_ENV || "";
export const TABLE_SUFFIX = ENV && ENV !== "production" ? "_" + ENV.replace(/[^a-z]/gi, "") : "";

// Manager-set flags, keyed by bus number. `flag` and `retorque_tires` are
// comma-joined lists (kept as-is for backward compatibility with saved data).
export const busFlags = pgTable(`bus_flags${TABLE_SUFFIX}`, {
  bus: text("bus").primaryKey(),
  flag: text("flag"),
  note: text("note"),
  inspMiles: integer("insp_miles"),
  holdReason: text("hold_reason"),
  retorqueTires: text("retorque_tires"),
  inspOption: text("insp_option"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Generic key/value store: the shared lot sheet ("current"), the hub sheets
// (fuel/def/turnover/workorder/workpick), employees, bus master, cached PDFs…
export const appState = pgTable(`app_state${TABLE_SUFFIX}`, {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Archive of past/erased sheets (Prev Sheets), keyed per sheet via sheet_key.
export const sheetHistory = pgTable(`sheet_history${TABLE_SUFFIX}`, {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  data: jsonb("data"),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow(),
  sheetKey: text("sheet_key"),
});

// Append-only log of lot-sheet operations for concurrency-safe multi-user edits.
export const lotSheetOps = pgTable(`lot_sheet_ops${TABLE_SUFFIX}`, {
  revision: bigserial("revision", { mode: "number" }).primaryKey(),
  op: jsonb("op").notNull(),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Site-wide audit log (flag-config changes, admin actions…).
export const auditEvents = pgTable(`audit_events${TABLE_SUFFIX}`, {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: text("kind").notNull(),
  actor: text("actor"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const schema = { busFlags, appState, sheetHistory, lotSheetOps, auditEvents };
