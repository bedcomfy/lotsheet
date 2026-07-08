import type { LotKey, LotSheet } from "./types";
import { cloneLotSheet } from "./lotSheetOps";

const STRING_FIELDS: Array<keyof Pick<LotSheet, "time" | "date" | "offProperty" | "inShop">> = [
  "time",
  "date",
  "offProperty",
  "inShop",
];
const BOOLEAN_FIELDS: Array<keyof Pick<LotSheet, "timeOverride" | "dateOverride">> = [
  "timeOverride",
  "dateOverride",
];

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function mergeLotSheet(baseSheet: LotSheet | null | undefined, localSheet: LotSheet, serverSheet: LotSheet | null | undefined): LotSheet {
  const base = cloneLotSheet(baseSheet);
  const local = cloneLotSheet(localSheet);
  const merged = cloneLotSheet(serverSheet || baseSheet || localSheet);

  for (const field of STRING_FIELDS) {
    if (!same(local[field], base[field])) merged[field] = local[field] || "";
  }
  for (const field of BOOLEAN_FIELDS) {
    if (!same(!!local[field], !!base[field])) merged[field] = !!local[field];
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
