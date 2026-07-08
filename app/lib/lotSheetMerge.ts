import type { LotKey, LotSheet, Lots } from "./types";

const STRING_FIELDS: Array<keyof Pick<LotSheet, "time" | "date" | "offProperty" | "inShop">> = [
  "time",
  "date",
  "offProperty",
  "inShop",
];

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

function cloneSheet(sheet: LotSheet | null | undefined): LotSheet {
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

export function mergeLotSheet(baseSheet: LotSheet | null | undefined, localSheet: LotSheet, serverSheet: LotSheet | null | undefined): LotSheet {
  const base = cloneSheet(baseSheet);
  const local = cloneSheet(localSheet);
  const merged = cloneSheet(serverSheet || baseSheet || localSheet);

  for (const field of STRING_FIELDS) {
    if (!same(local[field], base[field])) merged[field] = local[field] || "";
  }

  const cellKeys = new Set([...Object.keys(base.cells || {}), ...Object.keys(local.cells || {})]);
  for (const id of cellKeys) {
    const localValue = local.cells?.[id] || "";
    const baseValue = base.cells?.[id] || "";
    if (same(localValue, baseValue)) continue;
    if (localValue) merged.cells[id] = localValue;
    else delete merged.cells[id];
  }

  const lotKeys = new Set([...Object.keys(base.lots || {}), ...Object.keys(local.lots || {})]);
  for (const key of lotKeys) {
    const lotKey = key as LotKey;
    const localValue = local.lots?.[lotKey] || [];
    const baseValue = base.lots?.[lotKey] || [];
    if (!same(localValue, baseValue)) merged.lots[lotKey] = [...localValue];
  }

  if (!same(local.locks || [], base.locks || [])) merged.locks = [...(local.locks || [])];

  return merged;
}
