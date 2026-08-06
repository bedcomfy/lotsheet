import type { LotKey, LotSheet, Lots } from "./types";

export type LotStringField = "time" | "date" | "offProperty" | "inShop";
type LotBooleanField = "timeOverride" | "dateOverride";

export type LotSheetOp =
  | { type: "set_field"; field: LotStringField; value: string }
  | { type: "set_bool"; field: LotBooleanField; value: boolean }
  | { type: "set_cell"; id: string; value: string }
  | { type: "set_lot"; key: LotKey; value: string[] }
  | { type: "set_locks"; value: string[] }
  | { type: "set_lock"; id: string; value: boolean }
  | {
      type: "move_bus";
      bus: string;
      destination:
        | { kind: "cell"; id: string }
        | { kind: "lot"; key: LotKey; index?: number };
    }
  | { type: "clear_grid"; preserveLocks?: boolean }
  | { type: "clear_lots"; keys?: LotKey[] }
  | { type: "remove_bus"; bus: string }
  | { type: "replace_sheet"; sheet: LotSheet };

export interface LotSheetOpEnvelope {
  opId?: string;
  baseRevision?: number;
  op: LotSheetOp;
}

export interface LotSheetOpRecord {
  revision: number;
  opId?: string;
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
    timeOverride: !!sheet?.timeOverride,
    dateOverride: !!sheet?.dateOverride,
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
  if (o.type === "set_bool" && (o.field === "timeOverride" || o.field === "dateOverride")) {
    return { type: "set_bool", field: o.field, value: o.value === true };
  }
  if (o.type === "set_lot" && typeof o.key === "string" && Array.isArray(o.value)) {
    return { type: "set_lot", key: o.key as LotKey, value: o.value.map((v) => String(v || "")) };
  }
  if (o.type === "set_locks" && Array.isArray(o.value)) {
    return { type: "set_locks", value: o.value.map((v) => String(v || "")).filter(Boolean) };
  }
  if (o.type === "set_lock" && typeof o.id === "string") {
    return { type: "set_lock", id: o.id, value: o.value === true };
  }
  if (o.type === "move_bus" && typeof o.bus === "string" && o.destination && typeof o.destination === "object") {
    const destination = o.destination as Record<string, unknown>;
    if (destination.kind === "cell" && typeof destination.id === "string") {
      return {
        type: "move_bus",
        bus: o.bus,
        destination: { kind: "cell", id: destination.id },
      };
    }
    if (destination.kind === "lot" && typeof destination.key === "string") {
      const index = Number(destination.index);
      return {
        type: "move_bus",
        bus: o.bus,
        destination: {
          kind: "lot",
          key: destination.key as LotKey,
          ...(Number.isInteger(index) && index >= 0 ? { index } : {}),
        },
      };
    }
  }
  if (o.type === "clear_grid") {
    return { type: "clear_grid", preserveLocks: o.preserveLocks !== false };
  }
  if (o.type === "clear_lots") {
    return {
      type: "clear_lots",
      ...(Array.isArray(o.keys)
        ? { keys: o.keys.filter((key): key is LotKey => typeof key === "string") }
        : {}),
    };
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
  return normalizeOpEnvelopes(ops).map((entry) => entry.op);
}

export function normalizeOpEnvelopes(ops: unknown): LotSheetOpEnvelope[] {
  if (!Array.isArray(ops)) return [];
  const normalized: LotSheetOpEnvelope[] = [];
  for (const raw of ops) {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const wrapped = record && record.op && typeof record.op === "object";
    const op = normalizeOp(wrapped ? record.op : raw);
    if (!op) continue;
    const opId = wrapped && typeof record.opId === "string" ? record.opId.trim().slice(0, 160) : "";
    const revision = wrapped ? Number(record.baseRevision) : Number.NaN;
    normalized.push({
      op,
      ...(opId ? { opId } : {}),
      ...(Number.isInteger(revision) && revision >= 0 ? { baseRevision: revision } : {}),
    });
  }
  return normalized;
}

export function applyLotSheetOp(sheet: LotSheet | null | undefined, op: LotSheetOp): LotSheet {
  if (op.type === "replace_sheet") return cloneLotSheet(op.sheet);
  const next = cloneLotSheet(sheet);
  if (op.type === "set_field") {
    next[op.field] = op.value;
  } else if (op.type === "set_bool") {
    next[op.field] = op.value;
  } else if (op.type === "set_cell") {
    if (op.value) next.cells[op.id] = op.value;
    else delete next.cells[op.id];
  } else if (op.type === "set_lot") {
    // A bus lives in exactly one place. move_bus already enforces that, but the
    // list editors write whole lists with set_lot — a bus newly added here must
    // leave wherever else it sits (Fence vs North/South Lane, the grid, another
    // lot), or it shows up in two locations at once. ("X" is the bay's
    // out-of-use marker, not a bus.)
    const before = new Set(next.lots[op.key] || []);
    const added = op.value.filter((bus) => bus && bus !== "X" && !before.has(bus));
    let cleared = next;
    for (const bus of added) cleared = applyLotSheetOp(cleared, { type: "remove_bus", bus });
    cleared.lots[op.key] = [...op.value];
    return cleared;
  } else if (op.type === "set_locks") {
    next.locks = [...op.value];
  } else if (op.type === "set_lock") {
    const locks = new Set(next.locks || []);
    if (op.value) locks.add(op.id);
    else locks.delete(op.id);
    next.locks = [...locks];
  } else if (op.type === "move_bus") {
    const withoutBus = applyLotSheetOp(next, { type: "remove_bus", bus: op.bus });
    if (op.destination.kind === "cell") {
      withoutBus.cells[op.destination.id] = op.bus;
    } else {
      const key = op.destination.key;
      const current = [...(withoutBus.lots[key] || [])];
      if (key === "bay" && typeof op.destination.index === "number") {
        while (current.length <= op.destination.index) current.push("");
        current[op.destination.index] = op.bus;
      } else {
        const index =
          typeof op.destination.index === "number"
            ? Math.min(op.destination.index, current.length)
            : current.length;
        current.splice(index, 0, op.bus);
      }
      withoutBus.lots[key] = current;
    }
    return withoutBus;
  } else if (op.type === "clear_grid") {
    if (op.preserveLocks !== false) {
      const locked = new Set(next.locks || []);
      next.cells = Object.fromEntries(Object.entries(next.cells).filter(([id]) => locked.has(id)));
    } else {
      next.cells = {};
      next.locks = [];
    }
  } else if (op.type === "clear_lots") {
    const keys = op.keys || (Object.keys(next.lots) as LotKey[]);
    for (const key of keys) {
      // A blocked bay is a property of the physical spot, not a bus placement.
      // Clearing the bay group removes buses while keeping those X markers.
      next.lots[key] = key === "bay"
        ? (next.lots[key] || []).map((value) => (value === "X" ? "X" : ""))
        : [];
    }
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
  for (const field of ["timeOverride", "dateOverride"] as const) {
    if (!same(!!local[field], !!base[field])) ops.push({ type: "set_bool", field, value: !!local[field] });
  }

  const cellKeys = new Set([...Object.keys(base.cells || {}), ...Object.keys(local.cells || {})]);
  for (const id of cellKeys) {
    const localValue = local.cells[id] || "";
    const baseValue = base.cells[id] || "";
    if (!same(localValue, baseValue)) ops.push({ type: "set_cell", id, value: localValue });
  }

  const lotKeys = new Set([...Object.keys(base.lots || {}), ...Object.keys(local.lots || {})]);
  const clearedLotKeys: LotKey[] = [];
  const setLotOps: LotSheetOp[] = [];
  for (const key of lotKeys) {
    const lotKey = key as LotKey;
    const localValue = local.lots[lotKey] || [];
    const baseValue = base.lots[lotKey] || [];
    if (same(localValue, baseValue)) continue;

    const clearedValue = lotKey === "bay"
      ? baseValue.map((value) => (value === "X" ? "X" : ""))
      : [];
    const hadBus = baseValue.some((value) => value && value !== "X");
    if (hadBus && same(localValue, clearedValue)) {
      clearedLotKeys.push(lotKey);
    } else {
      setLotOps.push({ type: "set_lot", key: lotKey, value: [...localValue] });
    }
  }
  if (clearedLotKeys.length) ops.push({ type: "clear_lots", keys: clearedLotKeys });
  ops.push(...setLotOps);

  if (!same(local.locks || [], base.locks || [])) ops.push({ type: "set_locks", value: [...(local.locks || [])] });

  return ops;
}

export function createOpEnvelopes(
  ops: LotSheetOp[],
  baseRevision: number,
  createId: () => string
): LotSheetOpEnvelope[] {
  return ops.map((op) => ({
    opId: createId(),
    baseRevision: Math.max(0, Math.floor(baseRevision || 0)),
    op,
  }));
}
