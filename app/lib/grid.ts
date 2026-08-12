// Exact layout of the physical Lot Sheet.
//
// The main grid is 11 columns (ROW 1 .. ROW 11) by 10 bands (top -> bottom).
// Each entry is the printed slot number, or:
//   null  -> no printed number (ROW 11 column, filled only in special cases)
//   "X"   -> physically blocked slot (cannot hold a bus)
//
// Reading ACROSS each band matches the paper: 1..10, 11..20, ... and the
// blocked "X" sits where slot 40 would have been in ROW 10.

import type { FlagEntry, FlagMap } from "./types";
import { OBJECT_CODE_FLAGS, objectCodeFlagId, objectCodeFromFlagId } from "./objectCodes";
import {
  customNoteItems,
  customNoteText,
  hasCustomNotes,
  isCustomNoteFlag,
  operationalFlagIds,
} from "./customNoteFlags";

export const SLOTS: (number | string | null)[][] = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null],
  [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, null],
  [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, null],
  [31, 32, 33, 34, 35, 36, 37, 38, 39, "X", null],
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, null],
  [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, null],
  [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, null],
  [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, null],
  [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, null],
  [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, null],
];

export const COLUMN_COUNT = 11; // ROW 1 .. ROW 11
export const BAND_COUNT = SLOTS.length; // 10

// ROW 1 .. ROW 6 each get one extra "front" bus written above the first cell.
export const FRONT_COLUMNS = 6;

// East Lot strip across the bottom: present on the form (required) but unused.
export const EAST_LOT_CELLS = 11;

// Stable id for a writable cell, used as the key in the saved data object.
export function numberedCellId(slot: number): string {
  return `s${slot}`;
}
export function frontCellId(col: number): string {
  return `f${col}`; // col is 0-based: ROW 1 -> f0 ... ROW 6 -> f5
}
export function row11CellId(band: number): string {
  return `r11_${band}`; // band 0..9
}

// Which grid column (0-based) each numbered slot sits in. Built from SLOTS so it
// stays correct even where the numbering jumps around the blocked "X" slot.
const SLOT_COL: Record<number, number> = {};
SLOTS.forEach((band) => {
  band.forEach((slot, c) => {
    if (typeof slot === "number") SLOT_COL[slot] = c;
  });
});

// Human-readable spot for a cell id, e.g. "Row 5 · #85", "Row 3 · front",
// "Row 11". Empty string for an unknown id. Columns are labelled ROW 1..11.
export function cellLocationLabel(id: string): string {
  if (!id) return "";
  if (id.startsWith("r11_")) return "Row 11";
  if (id[0] === "s") {
    const slot = parseInt(id.slice(1), 10);
    const col = SLOT_COL[slot];
    return col == null ? `#${slot}` : `Row ${col + 1} · #${slot}`;
  }
  if (id[0] === "f") {
    const c = parseInt(id.slice(1), 10);
    return `Row ${c + 1} · front`;
  }
  return "";
}

export interface BusType {
  id: string;
  label: string;
  code: string;
  color: string;
  kind: "model" | "wrap";
}

// Bus TYPES — permanent roster properties. A bus can have MORE THAN ONE type
// (e.g. 25545 is both Pulse and Hybrid). Shown as letter code(s) in the cell
// corner. Regular buses have no type. Pulse is purple (the buses are purple).
export const BUS_TYPES: BusType[] = [
  { id: "standard", label: "Standard", code: "", color: "#475569", kind: "wrap" },
  { id: "pulse", label: "Pulse", code: "P", color: "#7c3aed", kind: "wrap" },
  { id: "hybrid", label: "Hybrid", code: "HEV", color: "#15803d", kind: "model" },
  { id: "short", label: "Short Bus (30')", code: "30'", color: "#b45309", kind: "model" },
  { id: "coach", label: "Coach / Single Door", code: "COACH", color: "#0f766e", kind: "model" },
  { id: "tow", label: "Tow Truck", code: "TOW", color: "#b91c1c", kind: "model" },
];
const BUILTIN_TYPE_IDS = new Set(BUS_TYPES.map((t) => t.id));

export interface BusModel {
  id: string;
  label: string;
  typeId: string;
  length: string;
}

export const BUS_MODELS: BusModel[] = [
  { id: "enc-ez-rider-ii-2010", label: "2010 ENC EZ-Rider II", typeId: "short", length: "30 feet" },
  { id: "enc-commuter-2013", label: "2013 ENC Commuter", typeId: "coach", length: "40 feet" },
  { id: "enc-axess-2013", label: "2013 ENC Axess", typeId: "", length: "40 feet" },
  { id: "enc-axess-2014", label: "2014 ENC Axess", typeId: "", length: "40 feet" },
  { id: "enc-axess-2015", label: "2015 ENC Axess", typeId: "", length: "40 feet" },
  { id: "enc-commuter-2016", label: "2016 ENC Commuter", typeId: "coach", length: "40 feet" },
  { id: "enc-pulse-ss-2016", label: "2016 ENC Pulse SS", typeId: "", length: "40 feet" },
  { id: "enc-axess-ss-2016", label: "2016 ENC Axess SS", typeId: "", length: "40 feet" },
  { id: "enc-pulse-axess-ss-2016", label: "2016 ENC Pulse/Axess SS", typeId: "", length: "40 feet" },
  { id: "gillig-low-floor-hev", label: "Gillig Low Floor Diesel Electric Hybrid", typeId: "hybrid", length: "40 feet" },
  { id: "tow-truck", label: "Tow Truck", typeId: "tow", length: "" },
];
const BUILTIN_MODEL_IDS = new Set(BUS_MODELS.map((model) => model.id));

// ---------- Bus type appearance + list config ----------
// Admins manage the list of bus types on the Bus Lists page: rename a type's
// corner code, recolour it, ADD new types, or REMOVE ones they don't use. The
// config is saved to app_state and applied on load, like flag config. With an
// empty config, this returns the built-in BUS_TYPES, so the Lot Sheet is
// unchanged until someone edits it. A built-in can be hidden with `removed`;
// a brand-new type is stored with `custom: true`.
export interface BusTypeConfigEntry {
  id: string;
  label?: string;
  code?: string;
  color?: string;
  kind?: "model" | "wrap";
  custom?: boolean;
  removed?: boolean;
}
export interface BusModelConfigEntry {
  id: string;
  label?: string;
  typeId?: string;
  length?: string;
  custom?: boolean;
  removed?: boolean;
}
export interface BusTypeConfig {
  types: Record<string, BusTypeConfigEntry>;
  models: Record<string, BusModelConfigEntry>;
}

let activeBusTypeConfig: BusTypeConfig = { types: {}, models: {} };

function sanitizeBusTypeEntry(id: string, entry: Partial<BusTypeConfigEntry> | null | undefined): BusTypeConfigEntry {
  const color = normalizeColor(entry?.color);
  return {
    id,
    ...(typeof entry?.label === "string" && entry.label.trim() ? { label: entry.label.trim() } : {}),
    // code may be blank on purpose (e.g. Standard shows no badge), so keep "".
    ...(typeof entry?.code === "string" ? { code: entry.code.trim() } : {}),
    ...(color ? { color } : {}),
    ...(entry?.kind === "model" || entry?.kind === "wrap" ? { kind: entry.kind } : {}),
    ...(entry?.custom === true ? { custom: true } : {}),
    ...(entry?.removed === true ? { removed: true } : {}),
  };
}

function sanitizeBusModelEntry(id: string, entry: Partial<BusModelConfigEntry> | null | undefined): BusModelConfigEntry {
  return {
    id,
    ...(typeof entry?.label === "string" && entry.label.trim() ? { label: entry.label.trim() } : {}),
    ...(typeof entry?.typeId === "string" ? { typeId: entry.typeId.trim() } : {}),
    ...(typeof entry?.length === "string" ? { length: entry.length.trim() } : {}),
    ...(entry?.custom === true ? { custom: true } : {}),
    ...(entry?.removed === true ? { removed: true } : {}),
  };
}

export function normalizeBusTypeConfig(input: unknown): BusTypeConfig {
  const source = input && typeof input === "object" ? (input as { types?: unknown; models?: unknown }) : {};
  const raw = source.types;
  const out: BusTypeConfig = { types: {}, models: {} };
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, Partial<BusTypeConfigEntry>>)) {
      const cleanId = String(id || "").trim();
      if (!cleanId) continue;
      const entry = sanitizeBusTypeEntry(cleanId, value);
      // Keep built-in overrides, removal markers, and custom types; drop junk.
      if (BUILTIN_TYPE_IDS.has(cleanId) || entry.custom || entry.removed) out.types[cleanId] = entry;
    }
  }
  if (source.models && typeof source.models === "object") {
    for (const [id, value] of Object.entries(source.models as Record<string, Partial<BusModelConfigEntry>>)) {
      const cleanId = String(id || "").trim();
      if (!cleanId) continue;
      const entry = sanitizeBusModelEntry(cleanId, value);
      if (BUILTIN_MODEL_IDS.has(cleanId) || entry.custom || entry.removed) out.models[cleanId] = entry;
    }
  }
  return out;
}

export function applyBusTypeConfig(input: unknown): BusTypeConfig {
  activeBusTypeConfig = normalizeBusTypeConfig(input);
  return activeBusTypeConfig;
}

// The effective bus-type list = built-ins (with overrides, minus removed) then
// custom additions. This is the single source of truth for both rendering and
// the editor.
export function effectiveBusTypes(): BusType[] {
  const cfg = activeBusTypeConfig.types;
  const out: BusType[] = [];
  for (const b of BUS_TYPES) {
    const c = cfg[b.id];
    if (c?.removed) continue;
    out.push({
      id: b.id,
      label: c?.label || b.label,
      code: c && "code" in c ? c.code || "" : b.code,
      color: c?.color || b.color,
      kind: c?.kind || b.kind,
    });
  }
  for (const c of Object.values(cfg)) {
    if (!c.custom || c.removed || BUILTIN_TYPE_IDS.has(c.id)) continue;
    out.push({ id: c.id, label: c.label || c.id, code: c.code || "", color: c.color || "#475569", kind: c.kind || "model" });
  }
  return out;
}

export function typeInfo(id: string): BusType | null {
  return effectiveBusTypes().find((t) => t.id === id) || null;
}

export interface BusTypeAdminRow {
  id: string;
  label: string;
  code: string;
  color: string;
  kind: "model" | "wrap";
  builtin: boolean;
}

// The editable rows for the Bus Lists page. Pass a config to preview without
// mutating global state.
export function editableBusTypeRows(configInput?: unknown): BusTypeAdminRow[] {
  const previous = activeBusTypeConfig;
  if (configInput !== undefined) activeBusTypeConfig = normalizeBusTypeConfig(configInput);
  const rows = effectiveBusTypes().map((t) => ({ ...t, builtin: BUILTIN_TYPE_IDS.has(t.id) }));
  if (configInput !== undefined) activeBusTypeConfig = previous;
  return rows;
}

export interface BusModelAdminRow extends BusModel {
  builtin: boolean;
}

export function effectiveBusModels(): BusModel[] {
  const cfg = activeBusTypeConfig.models;
  const out: BusModel[] = [];
  for (const model of BUS_MODELS) {
    const override = cfg[model.id];
    if (override?.removed) continue;
    out.push({
      id: model.id,
      label: override?.label || model.label,
      typeId: override && "typeId" in override ? override.typeId || "" : model.typeId,
      length: override && "length" in override ? override.length || "" : model.length,
    });
  }
  for (const model of Object.values(cfg)) {
    if (!model.custom || model.removed || BUILTIN_MODEL_IDS.has(model.id)) continue;
    out.push({ id: model.id, label: model.label || model.id, typeId: model.typeId || "", length: model.length || "" });
  }
  return out;
}

export function modelInfo(id: string | null | undefined): BusModel | null {
  if (!id) return null;
  return effectiveBusModels().find((model) => model.id === id) || null;
}

export function modelIdFromName(name: string | null | undefined): string {
  const clean = String(name || "").trim().toLowerCase();
  return effectiveBusModels().find((model) => model.label.toLowerCase() === clean)?.id ||
    BUS_MODELS.find((model) => model.label.toLowerCase() === clean)?.id || "";
}

export function editableBusModelRows(configInput?: unknown): BusModelAdminRow[] {
  const previous = activeBusTypeConfig;
  if (configInput !== undefined) activeBusTypeConfig = normalizeBusTypeConfig(configInput);
  const rows = effectiveBusModels().map((model) => ({ ...model, builtin: BUILTIN_MODEL_IDS.has(model.id) }));
  if (configInput !== undefined) activeBusTypeConfig = previous;
  return rows;
}

export interface FlagDef {
  id: string;
  label: string;
  objectCodes?: string[];
  objectCode?: boolean;
}

export type FlagTier = "high" | "med" | "low";

export interface FlagConfigEntry {
  id: string;
  name?: string;
  label?: string;
  tier?: FlagTier;
  color?: string;
  aliases?: string[];
  objectCodes?: string[];
  quick?: boolean;
  alwaysPrint?: boolean;
  department?: string;
  active?: boolean;
}

export interface FlagConfig {
  flags: Record<string, FlagConfigEntry>;
}

let activeFlagConfig: FlagConfig = { flags: {} };

function normalizeWords(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map((x) => String(x || "").trim()).filter(Boolean)));
}

function normalizeColor(value: unknown): string {
  const color = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return "";
}

function sanitizeFlagConfigEntry(id: string, entry: Partial<FlagConfigEntry> | null | undefined): FlagConfigEntry {
  const tier = entry?.tier === "high" || entry?.tier === "med" || entry?.tier === "low" ? entry.tier : undefined;
  const color = normalizeColor(entry?.color);
  return {
    id,
    ...(typeof entry?.name === "string" ? { name: entry.name.trim() } : {}),
    ...(typeof entry?.label === "string" ? { label: entry.label.trim() } : {}),
    ...(tier ? { tier } : {}),
    ...(color ? { color } : {}),
    ...(entry?.aliases ? { aliases: normalizeWords(entry.aliases) } : {}),
    ...(entry?.objectCodes ? { objectCodes: normalizeWords(entry.objectCodes) } : {}),
    ...(typeof entry?.quick === "boolean" ? { quick: entry.quick } : {}),
    ...(typeof entry?.alwaysPrint === "boolean" ? { alwaysPrint: entry.alwaysPrint } : {}),
    ...(typeof entry?.department === "string" ? { department: entry.department.trim() } : {}),
    ...(typeof entry?.active === "boolean" ? { active: entry.active } : {}),
  };
}

export function normalizeFlagConfig(input: unknown): FlagConfig {
  const raw = input && typeof input === "object" ? (input as { flags?: unknown }).flags : null;
  const out: FlagConfig = { flags: {} };
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, Partial<FlagConfigEntry>>)) {
      const cleanId = String(id || "").trim();
      if (!cleanId) continue;
      out.flags[cleanId] = sanitizeFlagConfigEntry(cleanId, value);
    }
  }
  return out;
}

export function applyFlagConfig(input: unknown): FlagConfig {
  activeFlagConfig = normalizeFlagConfig(input);
  return activeFlagConfig;
}

function flagConfigEntry(id: string | null | undefined): FlagConfigEntry | null {
  if (!id) return null;
  return activeFlagConfig.flags[id] || null;
}

// Manager-set operational FLAGS. Each is separate; the full name is shown so
// there's no confusion.
export const FLAGS: FlagDef[] = [
  { id: "none", label: "—" },
  { id: "legal", label: "LEGAL", objectCodes: ["6500"] },
  { id: "safety", label: "SAFETY", objectCodes: ["9200"] },
  { id: "accident", label: "ACCIDENT", objectCodes: ["5000"] },
  { id: "offprop", label: "OFF PROPERTY" },
  { id: "shop", label: "SHOP" },
  { id: "eng", label: "ENG", objectCodes: ["0800", "5008"] },
  { id: "trans", label: "TRANS", objectCodes: ["1300", "5013"] },
  { id: "oos", label: "OUT OF SERVICE" },
  { id: "inspection", label: "INSPECTION", objectCodes: ["6500", "6603", "6609", "6615", "6621", "6706", "6712", "6718", "6800", "1375"] },
  { id: "retorque", label: "RETORQUE", objectCodes: ["2402"] },
  { id: "hold", label: "HOLD" },
  { id: "split", label: "SPLIT" },
  { id: "service", label: "NEEDS SERVICE", objectCodes: ["8000"] },
  { id: "followup", label: "F/Up" },
  { id: "cards", label: "CARDS" },
  { id: "braketest", label: "BRAKE TEST", objectCodes: ["0415"] },
  { id: "ac", label: "A/C", objectCodes: ["2100", "5021"] },
  { id: "cleaning", label: "NEEDS CLEANING", objectCodes: ["1611", "7400"] },
  { id: "rfs", label: "READY FOR SERVICE" },
];
export const ALL_FLAGS: FlagDef[] = [...FLAGS, ...OBJECT_CODE_FLAGS];

// A Hold bus has a reason. These are the quick-picks; a free-text box also
// allows anything else. (Movement used to be its own flag — a movement bus is
// always a hold, so it's now a hold reason.)
export const HOLD_REASONS = ["Cubs Bus", "Movement", "Soldier Field", "Parade"];
export function flagLabel(id: string | null | undefined): string {
  if (isCustomNoteFlag(id)) return customNoteText(id);
  const override = flagConfigEntry(id);
  if (override?.label) return override.label;
  const objectCode = objectCodeFromFlagId(id);
  if (objectCode) return objectCode.code;
  const f = ALL_FLAGS.find((x) => x.id === id);
  return f ? f.label : "";
}

// Friendly names for the flag editor (the printed code stays = flagLabel).
const FLAG_NAMES: Record<string, string> = {
  legal: "Legal", safety: "Safety", accident: "Accident", offprop: "Off property", shop: "In shop", eng: "Engine",
  trans: "Transmission", oos: "Out of service", inspection: "Inspection",
  retorque: "Retorque", hold: "Hold", split: "Split", service: "Needs service",
  followup: "Follow up", cards: "Cards", braketest: "Brake test", ac: "A/C",
  cleaning: "Needs cleaning", rfs: "Ready for service",
};
export function flagName(id: string): string {
  if (isCustomNoteFlag(id)) return customNoteText(id);
  const override = flagConfigEntry(id);
  if (override?.name) return override.name;
  const objectCode = objectCodeFromFlagId(id);
  // Object-code chips should read like the actual problem, not an unexplained
  // number. The code remains searchable and is shown as secondary metadata.
  if (objectCode) return objectCode.description;
  return FLAG_NAMES[id] || flagLabel(id);
}

export function flagObjectCodes(id: string): string[] {
  const override = flagConfigEntry(id);
  const codes = override?.objectCodes || ALL_FLAGS.find((f) => f.id === id)?.objectCodes || [];
  if (id !== "inspection") return codes;
  return Array.from(new Set([...codes, ...INSPECTION_OPTIONS.map((option) => option.objectCode)]));
}

export interface FlagAdminRow {
  id: string;
  objectCode: boolean;
  name: string;
  label: string;
  tier: FlagTier;
  color: string;
  aliases: string[];
  objectCodes: string[];
  quick: boolean;
  alwaysPrint: boolean;
  department: string;
  active: boolean;
}

export function editableFlagRows(configInput?: unknown): FlagAdminRow[] {
  const previous = activeFlagConfig;
  if (configInput !== undefined) activeFlagConfig = normalizeFlagConfig(configInput);
  const rows = ALL_FLAGS.filter((flag) => flag.id !== "none").map((flag) => {
    const override = flagConfigEntry(flag.id);
    return {
      id: flag.id,
      objectCode: flag.objectCode === true,
      name: flagName(flag.id),
      label: flagLabel(flag.id),
      tier: flagTier(flag.id),
      color: flagColor(flag.id),
      aliases: override?.aliases || FLAG_ALIASES[flag.id] || [],
      objectCodes: flagObjectCodes(flag.id),
      quick: commonFlagIds().includes(flag.id),
      alwaysPrint: alwaysPrintFlagIds().includes(flag.id),
      department: override?.department || defaultDepartment(flag.id),
      active: override?.active !== false,
    };
  });
  if (configInput !== undefined) activeFlagConfig = previous;
  return rows;
}

export interface Department {
  id: string;
  label: string;
  flags: string[];
}

// Flags grouped by department, for the editor. A flag may appear in more than
// one department (shared); the By bus view shows it once, under the first one.
export const DEPARTMENTS: Department[] = [
  { id: "service", label: "Service", flags: ["service", "cleaning", "cards", "braketest", "retorque", "inspection", "hold", "followup", "rfs"] },
  { id: "maintenance", label: "Maintenance", flags: ["eng", "trans", "ac", "inspection", "hold", "retorque", "braketest", "cards", "oos", "offprop", "shop", "split", "followup", "rfs"] },
  { id: "safety", label: "Safety", flags: ["safety", "legal", "accident"] },
];

function defaultDepartment(id: string): string {
  return DEPARTMENTS.find((dept) => dept.flags.includes(id))?.id || "maintenance";
}

export function departmentGroups(): Department[] {
  const groups = DEPARTMENTS.map((dept) => ({ ...dept, flags: dept.flags.filter((id) => flagConfigEntry(id)?.active !== false) }));
  for (const entry of Object.values(activeFlagConfig.flags)) {
    if (!entry.department || entry.active === false) continue;
    const target = groups.find((dept) => dept.id === entry.department);
    if (!target) continue;
    for (const dept of groups) dept.flags = dept.flags.filter((id) => id !== entry.id);
    target.flags.push(entry.id);
  }
  return groups;
}

// Retorque must specify which tire(s). Left = door side (curbside), Right =
// traffic side (roadside); fronts on top, rears on the bottom. The stored ids
// keep the historical roadside/curbside initials so saved flags still load.
export const RETORQUE_TIRES = [
  { id: "cf", label: "Left front" },
  { id: "rf", label: "Right front" },
  { id: "cr", label: "Left rear" },
  { id: "rr", label: "Right rear" },
];
// Inspection details and their authoritative object codes. Keeping this in one
// table prevents chip labels, typed recognition, and saved object-code flags
// from drifting apart.
export interface InspectionOption {
  id: string;
  label: string;
  objectCode: string;
  aliases: string[];
}

export const INSPECTION_OPTIONS: InspectionOption[] = [
  { id: "A-3", label: "A-3", objectCode: "6603", aliases: ["a3", "pm a 3000", "pma 3000", "pma-3000", "pm-a 3000 miles"] },
  { id: "B-6", label: "B-6", objectCode: "6706", aliases: ["b6", "pm b 6000", "pmb 6000", "pmb-6000", "pm-b 6000 miles"] },
  { id: "A-9", label: "A-9", objectCode: "6609", aliases: ["a9", "pm a 9000", "pma 9000", "pma-9000", "pm-a 9000 miles"] },
  { id: "B-12", label: "B-12", objectCode: "6712", aliases: ["b12", "pm b 12000", "pmb 12000", "pmb-12000", "pm-b 12000 miles"] },
  { id: "A-15", label: "A-15", objectCode: "6615", aliases: ["a15", "pm a 15000", "pma 15000", "pma-15000", "pm-a 15000 miles"] },
  { id: "B-18", label: "B-18", objectCode: "6718", aliases: ["b18", "pm b 18000", "pmb 18000", "pmb-18000", "pm-b 18000 miles"] },
  { id: "A-21", label: "A-21", objectCode: "6621", aliases: ["a21", "pm a 21000", "pma 21000", "pma-21000", "pm-a 21000 miles"] },
  { id: "C-24", label: "C-24", objectCode: "6800", aliases: ["c24", "pm c 24000", "pmc 24000", "pmc-24000", "pm-c 24000 miles"] },
  { id: "TRANS-75", label: "Transmission PM-75000", objectCode: "1375", aliases: ["trans 75", "trans pm 75000", "transmission pm 75000", "trans p.m. 75000"] },
];

const normalizeInspectionText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function inspectionOptionFromText(value: string | null | undefined): InspectionOption | null {
  const query = normalizeInspectionText(String(value || ""));
  if (!query) return null;
  return INSPECTION_OPTIONS.find((option) =>
    [option.id, option.label, option.objectCode, ...option.aliases]
      .some((candidate) => normalizeInspectionText(candidate) === query)
  ) || null;
}

export function inspectionOptionLabel(value: string | null | undefined): string {
  return inspectionOptionFromText(value)?.label || String(value || "").trim();
}

function inspectionObjectCodeDescription(entry: FlagEntry | null | undefined): string {
  const option = inspectionOptionFromText(entry?.inspOption);
  return option ? flagName(objectCodeFlagId(option.objectCode)) : "";
}

const INSPECTION_OBJECT_FLAGS = new Set(INSPECTION_OPTIONS.map((option) => objectCodeFlagId(option.objectCode)));

export function setInspectionOption(entry: FlagEntry, value: string): FlagEntry {
  const option = inspectionOptionFromText(value);
  const flags = (entry.flags || []).filter((id) => !INSPECTION_OBJECT_FLAGS.has(id));
  if (!option) return { ...entry, flags, inspOption: "" };
  return {
    ...entry,
    flags: Array.from(new Set([...flags, "inspection", objectCodeFlagId(option.objectCode)])),
    inspOption: option.id,
  };
}

export function removeInspection(entry: FlagEntry): FlagEntry {
  return {
    ...entry,
    flags: (entry.flags || []).filter((id) => id !== "inspection" && !INSPECTION_OBJECT_FLAGS.has(id)),
    inspOption: "",
  };
}

export type FlagDetailKind = "retorque_tires" | "hold_reason" | "inspection_type";
export interface FlagDetailDefinition {
  flagId: string;
  kind: FlagDetailKind;
  label: string;
  required?: boolean;
}

export const FLAG_DETAIL_DEFINITIONS: FlagDetailDefinition[] = [
  { flagId: "retorque", kind: "retorque_tires", label: "Which tires?", required: true },
  { flagId: "hold", kind: "hold_reason", label: "Hold reason" },
  { flagId: "inspection", kind: "inspection_type", label: "Inspection type / follow up" },
];

export function flagDetailDefinition(id: string): FlagDetailDefinition | null {
  return FLAG_DETAIL_DEFINITIONS.find((def) => def.flagId === id) || null;
}

export function flagHasDetail(id: string): boolean {
  return !!flagDetailDefinition(id);
}

export function flagRequiresDetail(id: string): boolean {
  return !!flagDetailDefinition(id)?.required;
}
// Collapse the tire selection to a short label: All / Fronts / Rears, else list.
export function retorqueTiresDisplay(tires: string[] | null | undefined): string {
  const set = new Set((tires || []).filter(Boolean));
  if (set.size === 0) return "";
  if (set.size === 4) return "All";
  const fronts = set.has("rf") && set.has("cf");
  const rears = set.has("rr") && set.has("cr");
  if (set.size === 2 && fronts) return "Fronts";
  if (set.size === 2 && rears) return "Rears";
  return RETORQUE_TIRES.filter((t) => set.has(t.id)).map((t) => t.label).join(", ");
}

// The assignable flags (everything except "none").
export const ASSIGNABLE_FLAGS = ALL_FLAGS.filter((f) => f.id !== "none");

// Colour a flag by how serious it is, so a bus reads at a glance:
//   high (red)  — out of service / serious mechanical / safety
//   med (amber) — needs attention or in progress
//   low (blue)  — routine service
export function flagTier(id: string): FlagTier {
  if (isCustomNoteFlag(id)) return "low";
  const override = flagConfigEntry(id);
  if (override?.tier) return override.tier;
  if (objectCodeFromFlagId(id)) return "low";
  if (["legal", "safety", "accident", "oos", "eng", "trans"].includes(id)) return "high";
  if (["hold", "inspection", "retorque", "split", "braketest", "ac", "shop", "offprop", "followup"].includes(id))
    return "med";
  return "low"; // service, cleaning, cards, rfs
}

export function defaultFlagColor(id: string): string {
  const tier = flagTier(id);
  if (tier === "high") return "#DC2626";
  if (tier === "med") return "#D97706";
  return "#2563EB";
}

export function flagColor(id: string | null | undefined): string {
  if (isCustomNoteFlag(id)) return "#6B7280";
  const override = flagConfigEntry(id);
  return override?.color || (id ? defaultFlagColor(id) : "#6B7280");
}

export function flagColorStyle(id: string | null | undefined): Record<string, string> {
  return { "--flag-color": flagColor(id) };
}

// The flags surfaced as one-tap "most used" chips (in order) when the flag
// search box is empty — the handful this garage reaches for every day. The long
// tail is always one search away, so this list stays short on purpose.
export const COMMON_FLAGS = ["service", "cleaning", "hold", "inspection", "retorque", "oos", "offprop", "braketest"];

export function commonFlagIds(): string[] {
  const defaults = COMMON_FLAGS.filter((id) => flagConfigEntry(id)?.active !== false);
  const removed = new Set(
    Object.values(activeFlagConfig.flags)
      .filter((entry) => entry.quick === false)
      .map((entry) => entry.id)
  );
  const extra = Object.values(activeFlagConfig.flags)
    .filter((entry) => entry.quick && entry.active !== false && !defaults.includes(entry.id))
    .map((entry) => entry.id);
  return [...defaults, ...extra].filter((id) => !removed.has(id));
}

// Extra search words so a flag can be found by terms that aren't in its name
// (e.g. searching "air" or "climate" finds A/C). Keep these lowercase.
const FLAG_ALIASES: Record<string, string[]> = {
  ac: ["air conditioning", "climate", "heat", "cold"],
  oos: ["down", "broke", "broken", "dead"],
  rfs: ["ready", "done", "finished", "complete"],
  eng: ["engine", "motor"],
  trans: ["transmission", "gearbox", "shifting"],
  offprop: ["gone", "away", "off site"],
  braketest: ["brake", "brakes"],
  cleaning: ["dirty", "wash", "clean"],
  service: ["fuel", "def", "fluids", "oil"],
  followup: ["follow up", "revisit", "check back", "recheck"],
  cards: ["card"],
  inspection: [
    "pm", "preventive",
    ...INSPECTION_OPTIONS.flatMap((option) => [option.id, option.label, option.objectCode, ...option.aliases]),
  ],
  accident: ["crash", "collision", "wreck"],
  legal: ["law"],
};

// Find assignable flags matching a typed query, by friendly name, printed
// label, or alias. Names that START with the query rank above ones that merely
// contain it; ties break alphabetically. Empty query returns nothing (the
// caller shows the "most used" chips instead).
export function searchFlags(query: string): FlagDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { f: FlagDef; rank: number }[] = [];
  for (const f of ASSIGNABLE_FLAGS) {
    if (flagConfigEntry(f.id)?.active === false) continue;
    const override = flagConfigEntry(f.id);
    const hay = [
      flagName(f.id).toLowerCase(),
      flagLabel(f.id).toLowerCase(),
      f.label.toLowerCase(),
      ...flagObjectCodes(f.id),
      ...(override?.aliases || []),
      ...(FLAG_ALIASES[f.id] || []),
    ];
    let rank = Infinity;
    for (const h of hay) {
      const i = h.indexOf(q);
      if (i === 0) rank = Math.min(rank, 0);
      else if (i > 0) rank = Math.min(rank, 1);
    }
    if (rank !== Infinity) scored.push({ f, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || flagName(a.f.id).localeCompare(flagName(b.f.id)));
  return scored.map((s) => s.f);
}

// Turnover's fast-entry field accepts ordinary language. Prefer a direct
// phrase match; if that fails, use meaningful words only when they point to one
// clear best flag. Ambiguous text remains an Other note instead of guessing.
export function closestFlagMatch(input: string): FlagDef | null {
  const raw = input.trim();
  if (!raw) return null;
  const direct = searchFlags(raw);
  const exact = direct.find((flag) =>
    flagName(flag.id).trim().toLowerCase() === raw.toLowerCase() ||
    flagObjectCodes(flag.id).some((code) => code.toLowerCase() === raw.toLowerCase())
  );
  if (exact) return exact;
  const directBuiltins = direct.filter((flag) => !flag.objectCode);
  if (directBuiltins.length === 1) return directBuiltins[0];
  if (direct.length === 1) return direct[0];

  const ignored = new Set(["and", "the", "for", "bus", "issue", "problem", "needs", "needed", "repair"]);
  const words = raw.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length >= 3 && !ignored.has(word)) || [];
  const firstMatches = words.map((word) => {
    const matches = searchFlags(word);
    const builtins = matches.filter((flag) => !flag.objectCode);
    if (builtins.length === 1) return builtins[0];
    return matches.length === 1 ? matches[0] : null;
  }).filter((flag): flag is FlagDef => !!flag);
  if (!firstMatches.length) return null;

  const scores = new Map<string, { flag: FlagDef; count: number }>();
  for (const flag of firstMatches) {
    const prior = scores.get(flag.id);
    scores.set(flag.id, { flag, count: (prior?.count || 0) + 1 });
  }
  const ranked = Array.from(scores.values()).sort((a, b) => b.count - a.count);
  if (ranked.length > 1 && ranked[0].count === ranked[1].count) return null;
  return ranked[0].flag;
}

// Flag severity, most → least severe — used to pick which flag to show when a
// bus has several. HOLD outranks everything (a held bus files under HOLD on
// the printed flag summary no matter what else it carries). A custom note
// ("Other") is the least severe of all.
export const FLAG_SEVERITY = [
  "hold",
  "legal",
  "safety",
  "accident",
  "offprop",
  "shop",
  "eng",
  "trans",
  "oos",
  "inspection",
  "retorque",
  "split",
  "service",
  "followup",
  "cards",
  "braketest",
  "ac",
  "cleaning",
  "rfs",
];

function flagSeverityRank(id: string): number {
  const rank = FLAG_SEVERITY.indexOf(id);
  return rank === -1 ? FLAG_SEVERITY.length + 1 : rank;
}

// Flags that print on the grid even when "Maintenance info" is off, because
// they affect how the lot is read at a glance.
export const ALWAYS_PRINT_FLAGS = ["hold", "split"];

export function alwaysPrintFlagIds(): string[] {
  const ids = new Set(ALWAYS_PRINT_FLAGS);
  for (const entry of Object.values(activeFlagConfig.flags)) {
    if (entry.alwaysPrint === true && entry.active !== false) ids.add(entry.id);
    if (entry.alwaysPrint === false) ids.delete(entry.id);
  }
  return Array.from(ids);
}

// The always-print flags a bus carries, spelled out (e.g. "HOLD · SPLIT").
export function pinnedFlagText(entry: FlagEntry | null | undefined): string {
  if (!entry || !entry.flags) return "";
  return alwaysPrintFlagIds().filter((id) => entry.flags.includes(id))
    .map(flagLabel)
    .join(" · ");
}

export function mostSevereFlag(ids: string[] | null | undefined): string | null {
  let best: string | null = null;
  let rank = Infinity;
  const operational = operationalFlagIds(ids);
  for (const f of operational) {
    const r = flagSeverityRank(f);
    if (r < rank) {
      rank = r;
      best = f;
    }
  }
  return best || operational[0] || null;
}

// Shows the most-severe operational flag + a count of the rest, with a trailing
// "*" when custom-note flags exist. Custom text never spills into the compact
// Lot Sheet cells; a note-only bus reads "OTHER*".
export function flagDisplay(entry: FlagEntry | null | undefined): string {
  if (!entry) return "";
  const flags = operationalFlagIds(entry.flags);
  const noteCount = customNoteItems(entry).length;
  const hasNote = noteCount > 0;
  const count = flags.length + noteCount;
  if (count === 0) return "";
  const topLabel = flags.length > 0 ? flagLabel(mostSevereFlag(flags)) : "OTHER";
  const extra = count - 1;
  return `${topLabel}${extra > 0 ? ` +${extra}` : ""}${hasNote ? "*" : ""}`;
}

export function entryHasContent(entry: FlagEntry | null | undefined): boolean {
  return !!(entry && (operationalFlagIds(entry.flags).length || hasCustomNotes(entry)));
}

// Whether a bus is flagged for inspection.
export function hasInspection(entry: FlagEntry | null | undefined): boolean {
  return !!(entry && entry.flags && entry.flags.includes("inspection"));
}

// Inspection mileage readout: "Miles +300" (300 miles to go) or "Miles −100"
// (100 miles overdue). Empty string when no mileage is set. Only meaningful for
// buses that carry the inspection flag.
export function inspMilesDisplay(entry: FlagEntry | null | undefined): string {
  if (!entry) return "";
  const m = entry.inspMiles;
  if (m === null || m === undefined) return "";
  const n = Number(m);
  if (!Number.isFinite(n)) return "";
  return `Miles ${n < 0 ? "−" : "+"}${Math.abs(n)}`;
}

// All of a bus's flag labels, ordered most → least severe. HOLD carries its
// reason inline ("HOLD (Cubs Bus)") so every full display shows it.
export function flagListLabels(entry: FlagEntry | null | undefined): string[] {
  const flags = (entry?.flags || [])
    .slice()
    .sort((a, b) => flagSeverityRank(a) - flagSeverityRank(b));
  return flags
    .map((id) => {
      // Full-detail surfaces (Turnover and Buses with Flags) spell out an
      // object-code description. Compact grid cells still use flagLabel(id),
      // which intentionally remains the short numeric code.
      const label = objectCodeFromFlagId(id) ? flagName(id) : flagLabel(id);
      if (!label) return "";
      const reason = (entry?.holdReason || "").trim();
      if (id === "hold" && reason) return `${label} (${reason})`;
      return label;
    })
    .filter(Boolean);
}

// Every flag spelled out in full, plus the custom "Other" note text (not just a
// "*"), e.g. "INSPECTION, NEEDS CLEANING, A/C, broken mirror". Empty if none.
export function flagsAndNote(entry: FlagEntry | null | undefined): string {
  if (!entry) return "";
  const parts = flagListLabels({ ...entry, flags: operationalFlagIds(entry.flags) });
  parts.push(...customNoteItems(entry).map((item) => item.text));
  return parts.join(", ");
}

// Object-code descriptions already identify the inspection type, so only append
// legacy mileage details that are not represented by an object-code flag.
export function flagsFullDisplay(entry: FlagEntry | null | undefined): string {
  const base = flagsAndNote(entry);
  const detail = inspMilesDisplay(entry);
  if (base && detail) return `${base} · ${detail}`;
  return base || detail;
}

export interface FlagGroup {
  cat: string;
  label: string;
  buses: string[];
}

// Group every flagged bus under its most-severe flag (note-only buses go under
// "Other"), each group sorted numerically. Returns ordered groups for the
// back-of-sheet summary: [{ cat, label, buses: [busNumber, ...] }].
export function groupFlaggedBuses(flagsMap: FlagMap | null | undefined): FlagGroup[] {
  const groups: Record<string, string[]> = {};
  for (const [bus, entry] of Object.entries(flagsMap || {})) {
    const operational = operationalFlagIds(entry?.flags);
    const hasFlags = operational.length > 0;
    const hasNote = hasCustomNotes(entry);
    if (!hasFlags && !hasNote) continue;
    const cat = (hasFlags ? mostSevereFlag(operational) : "other") || "other";
    (groups[cat] = groups[cat] || []).push(bus);
  }
  const order = [...FLAG_SEVERITY, "other"];
  const result: FlagGroup[] = [];
  const emitted = new Set<string>();
  for (const cat of order) {
    const buses = groups[cat];
    if (!buses || !buses.length) continue;
    buses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    result.push({ cat, label: cat === "other" ? "OTHER" : flagLabel(cat), buses });
    emitted.add(cat);
  }
  for (const cat of Object.keys(groups).sort((a, b) => flagName(a).localeCompare(flagName(b), undefined, { numeric: true }))) {
    if (emitted.has(cat)) continue;
    const buses = groups[cat];
    buses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    result.push({ cat, label: flagName(cat) || flagLabel(cat), buses });
  }
  return result;
}

// ---- Fuel / DEF flag display ----
// The fuel/DEF sheets show ONE letter to the left of the bus number: R / H / I
// for a single retorque / hold / inspection flag, or "*" when the bus has more
// than one service-lane flag.
const FUEL_LETTERS: [string, string][] = [
  ["retorque", "R"],
  ["hold", "H"],
  ["inspection", "I"],
  ["braketest", "B"],
  ["cards", "C"],
];
export function fuelIndicator(entry: FlagEntry | null | undefined): string {
  if (!entry || !entry.flags) return "";
  const hits = FUEL_LETTERS.filter(([id]) => entry.flags.includes(id));
  if (hits.length === 0) return "";
  // Keep this as ASCII. The previously centered Unicode glyph was not present
  // in the PDF font and rendered as a missing-character box in Chromium PDFs.
  if (hits.length > 1) return "*";
  return hits[0][1];
}

export interface FlagItem {
  id: string;
  label: string;
  detail: string;
}
export interface FlagRow {
  bus: string;
  items: FlagItem[];
  indicator: string;
}
export interface FuelSection {
  id: string;
  label: string;
  rows: FlagRow[];
}

// The fuel/DEF second sheet: one row per flagged bus, listing its Retorque /
// Inspection / Hold flags (only those three) next to the number, each with its
// detail (inspection miles / hold reason).
export const FUEL_SUMMARY_FLAGS = ["retorque", "inspection", "hold", "braketest", "cards"];
export function fuelBusFlagList(flagsMap: FlagMap | null | undefined): FlagRow[] {
  const rows: FlagRow[] = [];
  for (const [bus, entry] of Object.entries(flagsMap || {})) {
    if (!entry || !entry.flags) continue;
    const items: FlagItem[] = [];
    for (const id of FUEL_SUMMARY_FLAGS) {
      if (!entry.flags.includes(id)) continue;
      let detail = "";
      if (id === "inspection") detail = inspectionObjectCodeDescription(entry) || inspMilesDisplay(entry);
      else if (id === "hold") detail = (entry.holdReason || "").trim();
      else if (id === "retorque") detail = retorqueTiresDisplay(entry.retorqueTires);
      items.push({ id, label: flagLabel(id), detail });
    }
    if (items.length) rows.push({ bus, items, indicator: fuelIndicator(entry) });
  }
  rows.sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true }));
  return rows;
}

// Fuel/DEF flagged-buses summary split into sections by flag group. A bus is
// listed once, under the highest-precedence group it carries (Holds/Cards/Brake
// tests > Inspections > Retorques), but its line lists every flag it has.
export const FUEL_SECTIONS = [
  { id: "holdcards", label: "Holds · Cards · Brake tests", flags: ["hold", "cards", "braketest"] },
  { id: "inspection", label: "Inspections", flags: ["inspection"] },
  { id: "retorque", label: "Retorques", flags: ["retorque"] },
];
const FUEL_ITEM_ORDER = ["hold", "cards", "braketest", "inspection", "retorque"];
export function fuelFlagSections(flagsMap: FlagMap | null | undefined): FuelSection[] {
  const out: FuelSection[] = FUEL_SECTIONS.map((s) => ({ id: s.id, label: s.label, rows: [] }));
  for (const [bus, entry] of Object.entries(flagsMap || {})) {
    if (!entry || !entry.flags) continue;
    const idx = FUEL_SECTIONS.findIndex((s) => s.flags.some((f) => entry.flags.includes(f)));
    if (idx === -1) continue;
    const items: FlagItem[] = FUEL_ITEM_ORDER.filter((f) => entry.flags.includes(f)).map((f) => {
      let detail = "";
      if (f === "inspection") detail = inspectionObjectCodeDescription(entry) || inspMilesDisplay(entry);
      else if (f === "hold") detail = (entry.holdReason || "").trim();
      else if (f === "retorque") detail = retorqueTiresDisplay(entry.retorqueTires);
      return { id: f, label: flagLabel(f), detail };
    });
    out[idx].rows.push({ bus, items, indicator: fuelIndicator(entry) });
  }
  out.forEach((s) => s.rows.sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true })));
  return out.filter((s) => s.rows.length);
}
