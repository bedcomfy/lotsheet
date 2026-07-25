import {
  applyLotSheetOpsToSheet,
  createOpEnvelopes,
  type LotSheetOp,
  type LotSheetOpEnvelope,
  type LotSheetOpRecord,
} from "./lotSheetOps";
import type { LotSheet } from "./types";

export const LOT_SHEET_OUTBOX_VERSION = 1;

export interface LotSheetPendingBatch {
  version: typeof LOT_SHEET_OUTBOX_VERSION;
  createdAt: string;
  snapshot: LotSheet;
  entries: LotSheetOpEnvelope[];
}

export interface AppliedOperationPage {
  sheet: LotSheet;
  revision: number;
  applied: number;
}

export function createClientOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createPendingBatch(
  ops: LotSheetOp[],
  snapshot: LotSheet,
  baseRevision: number,
  createId: () => string = createClientOpId
): LotSheetPendingBatch {
  return {
    version: LOT_SHEET_OUTBOX_VERSION,
    createdAt: new Date().toISOString(),
    snapshot,
    entries: createOpEnvelopes(ops, baseRevision, createId),
  };
}

export function parsePendingBatch(value: string | null | undefined): LotSheetPendingBatch | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<LotSheetPendingBatch>;
    if (
      parsed.version !== LOT_SHEET_OUTBOX_VERSION ||
      !parsed.snapshot ||
      typeof parsed.snapshot !== "object" ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.length
    ) {
      return null;
    }
    const entries = parsed.entries.filter(
      (entry): entry is LotSheetOpEnvelope =>
        !!entry &&
        typeof entry === "object" &&
        typeof entry.opId === "string" &&
        !!entry.op &&
        typeof entry.op === "object"
    );
    if (!entries.length) return null;
    return {
      version: LOT_SHEET_OUTBOX_VERSION,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
      snapshot: parsed.snapshot as LotSheet,
      entries,
    };
  } catch {
    return null;
  }
}

export function applyOperationPage(
  baseSheet: LotSheet,
  currentRevision: number,
  records: LotSheetOpRecord[]
): AppliedOperationPage {
  const ordered = records
    .filter((record) => Number(record.revision) > currentRevision)
    .sort((a, b) => Number(a.revision) - Number(b.revision));
  return {
    sheet: applyLotSheetOpsToSheet(baseSheet, ordered.map((record) => record.op)),
    revision: ordered[ordered.length - 1]?.revision || currentRevision,
    applied: ordered.length,
  };
}
