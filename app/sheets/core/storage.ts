import type { LotSheetOpEnvelope, LotSheetOpRecord } from "../../lib/lotSheetOps";
import type { LotSheet } from "../../lib/types";
import type { SheetDefinition } from "./types";

export interface SheetLoadResult<T> {
  value: T;
  updatedAt: string | null;
  revision?: number;
}

export interface SheetHistoryRecord<T> {
  id: string;
  value: T;
  savedAt: string | null;
}

export interface SheetStorageAdapter<T> {
  load(): Promise<SheetLoadResult<T>>;
  save(value: T): Promise<SheetLoadResult<T>>;
  history(): Promise<SheetHistoryRecord<T>[]>;
  archive?(value: T): Promise<void>;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Sheet request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function validatedValue<T>(definition: SheetDefinition<T>, raw: unknown): T {
  if (definition.validate) return definition.validate(raw);
  if (raw !== null && raw !== undefined) return raw as T;
  if (definition.createBlank) return definition.createBlank();
  throw new Error(`${definition.id} has no data validator or blank factory`);
}

export function createKeyedStateAdapter<T>(definition: SheetDefinition<T>): SheetStorageAdapter<T> {
  if (!definition.stateKey) throw new Error(`${definition.id} needs a stateKey`);
  const endpoint = `/api/state/${definition.stateKey}`;
  const historyEndpoint = `${endpoint}/history`;

  return {
    async load() {
      const body = await json<{ value: unknown; updatedAt?: string | null }>(
        await fetch(endpoint, { cache: "no-store" })
      );
      return {
        value: validatedValue(definition, body.value),
        updatedAt: body.updatedAt || null,
      };
    },
    async save(value) {
      const validated = validatedValue(definition, value);
      const body = await json<{ updatedAt?: string | null }>(
        await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: validated }),
        })
      );
      return { value: validated, updatedAt: body.updatedAt || null };
    },
    async history() {
      const body = await json<{ sheets?: Array<{ id: string; sheet: unknown; savedAt?: string | null }> }>(
        await fetch(historyEndpoint, { cache: "no-store" })
      );
      return (body.sheets || []).map((record) => ({
        id: String(record.id),
        value: validatedValue(definition, record.sheet),
        savedAt: record.savedAt || null,
      }));
    },
    async archive(value) {
      await json(
        await fetch(historyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheet: validatedValue(definition, value) }),
        })
      );
    },
  };
}

export interface LotSheetStorageAdapter extends SheetStorageAdapter<LotSheet> {
  submit(entries: LotSheetOpEnvelope[], actor: string): Promise<{
    sheet: LotSheet;
    revision: number;
    updatedAt: string | null;
    ops: LotSheetOpRecord[];
  }>;
  operationsSince(revision: number): Promise<{
    sheet: LotSheet;
    revision: number;
    nextRevision: number;
    hasMore: boolean;
    ops: LotSheetOpRecord[];
  }>;
}

export function createLotSheetStorageAdapter(definition: SheetDefinition<LotSheet>): LotSheetStorageAdapter {
  return {
    async load() {
      const body = await json<{ sheet: unknown; updatedAt?: string | null; revision?: number }>(
        await fetch("/api/sheet", { cache: "no-store" })
      );
      return {
        value: validatedValue(definition, body.sheet),
        updatedAt: body.updatedAt || null,
        revision: Number(body.revision || 0),
      };
    },
    async save(value) {
      const validated = validatedValue(definition, value);
      const body = await json<{ sheet: unknown; updatedAt?: string | null; revision?: number }>(
        await fetch("/api/sheet", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheet: validated }),
        })
      );
      return {
        value: validatedValue(definition, body.sheet),
        updatedAt: body.updatedAt || null,
        revision: Number(body.revision || 0),
      };
    },
    async submit(entries, actor) {
      const body = await json<{
        sheet: LotSheet;
        revision: number;
        updatedAt?: string | null;
        ops?: LotSheetOpRecord[];
      }>(
        await fetch("/api/sheet/ops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: entries, actor }),
        })
      );
      return {
        sheet: validatedValue(definition, body.sheet),
        revision: Number(body.revision || 0),
        updatedAt: body.updatedAt || null,
        ops: body.ops || [],
      };
    },
    async operationsSince(revision) {
      const body = await json<{
        sheet: LotSheet;
        revision: number;
        nextRevision?: number;
        hasMore?: boolean;
        ops?: LotSheetOpRecord[];
      }>(
        await fetch(`/api/sheet/ops?since=${Math.max(0, Math.floor(revision))}&limit=500`, {
          cache: "no-store",
        })
      );
      return {
        sheet: validatedValue(definition, body.sheet),
        revision: Number(body.revision || 0),
        nextRevision: Number(body.nextRevision || revision),
        hasMore: body.hasMore === true,
        ops: body.ops || [],
      };
    },
    async history() {
      const body = await json<{ sheets?: Array<{ id: string; sheet: unknown; savedAt?: string | null }> }>(
        await fetch("/api/sheet/history", { cache: "no-store" })
      );
      return (body.sheets || []).map((record) => ({
        id: String(record.id),
        value: validatedValue(definition, record.sheet),
        savedAt: record.savedAt || null,
      }));
    },
    async archive(value) {
      await json(
        await fetch("/api/sheet/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheet: validatedValue(definition, value) }),
        })
      );
    },
  };
}
