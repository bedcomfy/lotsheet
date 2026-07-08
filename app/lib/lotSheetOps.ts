import type { LotKey, LotSheet, Lots } from "./types";

export type LotStringField = "time" | "date" | "offProperty" | "inShop";

export type LotSheetOp =
  | { type: "set_field"; field: LotStringField; value: string }
  | { type: "set_cell"; id: string; value: string }
  | { type: "set_lot"; key: LotKey; value: string[] }
  | { type: "set_locks"; value: string[] }
  | { type: "remove_bus"; bus: string }
  | { type: "replace_sheet"; sheet: LotSheet };

export interface LotSheetOpRecord {
  revision: number;
  op: LotSheetOp;
  actor?: string;
  createdAt?: string | null;
}

const FIELDS: LotStringField[] = ["time", "date", "offProperty", "inShop"];

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function cloneLots(lots: Lots | undefined): Lots {
  const out: Lots = {};
  for (const [key, value] of Object.entries(lots || {})) {
    if (Array.isArray(value)) out[key as LotKey] = [...value];
  }
  return out;
}

export function cloneLotSheet(sheet: LotSheet | null | undefined): LotSheet {
  return {
    time: sheet?.time || "",
    date: sheet?.date || "",
    offProperty: sheet?.offProperty || "",
    inShop: sheet?.inShop || "",
    cells: { ...(sheet?.cells || {}) },
    lots: cloneLots(sheet?.lots),
    locks: [...(sheet?.locks || [])],
  };
}

function normalizeOp(op: unknown): LotSheetOp | null {
  if (!op || typeof op !== "object") return null;
  const o = op as Record<string, unknown>;
  if (o.type === "set_field" && FIELDS.includes(o.field as LotStringField)) {
    return { type: "set_field", field: o.field as LotStringField, value: String(o.value || "") };
  }
  if (o.type === "set_cell" && typeof o.id === "string") {
    return { type: "set_cell", id: o.id, value: String(o.value || "") };
  }
  if (o.type === "set_lot" && typeof o.key === "string" && Array.isArray(o.value)) {
    return { type: "set_lot", key: o.key as LotKey, value: o.value.map((v) => String(v || "")) };
  }
  if (o.type === "set_locks" && Array.isArray(o.value)) {
    return { type: "set_locks", value: o.value.map((v) => String(v || "")).filter(Boolean) };
  }
  if (o.type === "remove_bus" && typeof o.bus === "string") {
    return { type: "remove_bus", bus: o.bus };
  }
  if (o.type === "replace_sheet" && o.sheet && typeof o.sheet === "object") {
    return { type: "replace_sheet", sheet: cloneLotSheet(o.sheet as LotSheet) };
  }
  return null;
}

export function normalizeOps(ops: unknown): LotSheetOp[] {
  if (!Array.isArray(ops)) return [];
  return ops.map(normalizeOp).filter((op): op is LotSheetOp => !!op);
}

export function applyLotSheetOp(sheet: LotSheet | null | undefined, op: LotSheetOp): LotSheet {
  if (op.type === "replace_sheet") return cloneLotSheet(op.sheet);
  const next = cloneLotSheet(sheet);
  if (op.type === "set_field") {
    next[op.field] = op.value;
  } else if (op.type === "set_cell") {
    if (op.value) next.cells[op.id] = op.value;
    else delete next.cells[op.id];
  } else if (op.type === "set_lot") {
    next.lots[op.key] = [...op.value];
  } else if (op.type === "set_locks") {
    next.locks = [...op.value];
  } else if (op.type === "remove_bus") {
    for (const [id, value] of Object.entries(next.cells)) {
      if (value === op.bus) delete next.cells[id];
    }
    for (const [key, arr] of Object.entries(next.lots)) {
      if (!Array.isArray(arr)) continue;
      next.lots[key as LotKey] =
        key === "bay" ? arr.map((value) => (value === op.bus ? "" : value)) : arr.filter((value) => value !== op.bus);
    }
  }
  return next;
}

export function applyLotSheetOpsToSheet(sheet: LotSheet | null | undefined, ops: LotSheetOp[]): LotSheet {
  return ops.reduce((cur, op) => applyLotSheetOp(cur, op), cloneLotSheet(sheet));
}

export function diffLotSheetOps(baseSheet: LotSheet | null | undefined, localSheet: LotSheet): LotSheetOp[] {
  const base = cloneLotSheet(baseSheet);
  const local = cloneLotSheet(localSheet);
  const ops: LotSheetOp[] = [];

  for (const field of FIELDS) {
    if (!same(local[field], base[field])) ops.push({ type: "set_field", field, value: local[field] || "" });
  }

  const cellKeys = new Set([...Object.keys(base.cells || {}), ...Object.keys(local.cells || {})]);
  for (const id of cellKeys) {
    const localValue = local.cells[id] || "";
    const baseValue = base.cells[id] || "";
    if (!same(localValue, baseValue)) ops.push({ type: "set_cell", id, value: localValue });
  }

  const lotKeys = new Set([...Object.keys(base.lots || {}), ...Object.keys(local.lots || {})]);
  for (const key of lotKeys) {
    const lotKey = key as LotKey;
    const localValue = local.lots[lotKey] || [];
    const baseValue = base.lots[lotKey] || [];
    if (!same(localValue, baseValue)) ops.push({ type: "set_lot", key: lotKey, value: [...localValue] });
  }

  if (!same(local.locks || [], base.locks || [])) ops.push({ type: "set_locks", value: [...(local.locks || [])] });

  return ops;
}
