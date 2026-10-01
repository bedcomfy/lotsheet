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
  cardsReason: text("cards_reason"),
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
  opId: text("op_id"),
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

// Preventive-maintenance mileage: latest odometer, the last inspection (type
// and mileage — last_pm_* columns), and the last transmission PM per bus.
// Intervals are fixed by the inspection cycle, never stored.
export const pmMileage = pgTable(`pm_mileage${TABLE_SUFFIX}`, {
  bus: text("bus").primaryKey(),
  odometer: integer("odometer"),
  odometerDate: text("odometer_date"),
  lastServiceAt: text("last_service_at"),
  lastServiceMiles: integer("last_service_miles"),
  lastInspType: text("last_insp_type"),
  lastInspMiles: integer("last_pm_miles"),
  lastInspDate: text("last_pm_date"),
  lastTransMiles: integer("last_trans_miles"),
  lastTransDate: text("last_trans_date"),
  nextInspType: text("next_insp_type"),
  nextInspMiles: integer("next_insp_miles"),
  nextTransMiles: integer("next_trans_miles"),
  disposition: text("disposition"), // shop / follow-up / hold / split
  note: text("note"),
  source: text("source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Every completed PM (inspection or transmission), for history and reports.
export const pmInspections = pgTable(`pm_inspections${TABLE_SUFFIX}`, {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bus: text("bus").notNull(),
  kind: text("kind").notNull(), // "inspection" | "trans"
  type: text("type"), // A-3 … C-24 for inspections
  miles: integer("miles").notNull(),
  doneAt: text("done_at"),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Every odometer reading that was recorded, so mileage reports can show the
// history and a bad PDF import can be traced. `batch` groups one import.
export const pmMileageLog = pgTable(`pm_mileage_log${TABLE_SUFFIX}`, {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bus: text("bus").notNull(),
  odometer: integer("odometer").notNull(),
  readAt: text("read_at"),
  source: text("source"),
  batch: text("batch"),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const schema = { busFlags, appState, sheetHistory, lotSheetOps, auditEvents, pmMileage, pmMileageLog, pmInspections };
