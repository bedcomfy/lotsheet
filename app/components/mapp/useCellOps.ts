"use client";

// Grid-cell writes for the phone app, through the SAME pipeline desktop uses:
// POST /api/sheet/ops with set_cell ops (server applies them, bumps the live
// pulse) + an optimistic patch of the shared ["sheet"] cache so the UI is
// instant. Nothing desktop-side changes.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LotSheet } from "../../lib/types";
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
        for (const op of ops) {
          if (op.type !== "set_cell") continue;
          if (op.value) cells[op.id] = op.value;
          else delete cells[op.id];
        }
        return { ...prev, sheet: { ...prev.sheet, cells } };
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

  return { setCell, moveCell };
}
