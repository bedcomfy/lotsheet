"use client";

// Grid-cell writes for the phone app, through the SAME pipeline desktop uses:
// POST /api/sheet/ops with set_cell ops (server applies them, bumps the live
// pulse) + an optimistic patch of the shared ["sheet"] cache so the UI is
// instant. Nothing desktop-side changes.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LotKey, LotSheet } from "../../lib/types";
import type { LotSheetOp } from "../../lib/lotSheetOps";
import { getDeviceActor } from "../../lib/deviceActor";

type SheetPayload = { sheet: LotSheet | null; updatedAt: string | null };

export function cellNum(v: unknown): string {
  if (!v) return "";
  return typeof v === "string" ? v : (v as { num?: string }).num || "";
}

export function useCellOps() {
  const qc = useQueryClient();

  const postOps = useCallback(
    (ops: LotSheetOp[]) => {
      // Optimistic: patch the shared cache immediately.
      qc.setQueryData<SheetPayload>(["sheet"], (prev) => {
        if (!prev?.sheet) return prev;
        const cells = { ...(prev.sheet.cells || {}) };
        const lots = { ...(prev.sheet.lots || {}) };
        for (const op of ops) {
          if (op.type === "set_cell") {
            if (op.value) cells[op.id] = op.value;
            else delete cells[op.id];
          } else if (op.type === "set_lot") {
            lots[op.key] = [...op.value];
          }
        }
        return { ...prev, sheet: { ...prev.sheet, cells, lots } };
      });
      // Real write — same endpoint, same op format, same actor tag as desktop.
      return fetch("/api/sheet/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, actor: getDeviceActor() }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`ops → ${r.status}`);
        })
        .catch(() => {
          // On failure, refetch so the optimistic patch can't drift from truth.
          qc.invalidateQueries({ queryKey: ["sheet"] });
        });
    },
    [qc]
  );

  const setCell = useCallback(
    (id: string, value: string) => postOps([{ type: "set_cell", id, value }]),
    [postOps]
  );

  // Move a bus from one grid spot to another in a single batch.
  const moveCell = useCallback(
    (fromId: string, toId: string, bus: string) =>
      postOps([
        { type: "set_cell", id: fromId, value: "" },
        { type: "set_cell", id: toId, value: bus },
      ]),
    [postOps]
  );

  // Move a bus to ANY destination (a grid spot, a lot, or a numbered bay
  // slot), removing it from wherever it currently sits — one atomic batch.
  const moveBus = useCallback(
    (bus: string, dest: { cellId?: string; lotKey?: string; lotIndex?: number }) => {
      const data = qc.getQueryData<SheetPayload>(["sheet"]);
      const sheet = data?.sheet;
      if (!sheet || !bus) return Promise.resolve();
      const ops: LotSheetOp[] = [];
      // remove from any grid cell
      for (const [id, v] of Object.entries(sheet.cells || {})) {
        if (cellNum(v) === bus && id !== dest.cellId) ops.push({ type: "set_cell", id, value: "" });
      }
      // remove from any lot (unless it's the destination lot — handled below)
      const lots = sheet.lots || {};
      for (const [key, arr] of Object.entries(lots)) {
        if (!Array.isArray(arr) || !arr.includes(bus)) continue;
        if (key === dest.lotKey) continue;
        ops.push({
          type: "set_lot",
          key: key as LotKey,
          value: key === "bay" ? arr.map((b) => (b === bus ? "" : b)) : arr.filter((b) => b !== bus),
        });
      }
      // add at the destination
      if (dest.cellId) {
        ops.push({ type: "set_cell", id: dest.cellId, value: bus });
      } else if (dest.lotKey === "bay" && dest.lotIndex != null) {
        const arr = [...(lots.bay || [])];
        while (arr.length < 10) arr.push("");
        arr[dest.lotIndex] = bus;
        ops.push({ type: "set_lot", key: "bay", value: arr });
      } else if (dest.lotKey) {
        const cur = (lots[dest.lotKey as LotKey] || []).filter((b) => b !== bus);
        ops.push({ type: "set_lot", key: dest.lotKey as LotKey, value: [...cur, bus] });
      }
      return postOps(ops);
    },
    [postOps, qc]
  );

  return { setCell, moveCell, moveBus };
}
