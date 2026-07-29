import { describe, expect, it } from "vitest";
import { applyLotSheetOp, applyLotSheetOpsToSheet, createOpEnvelopes, normalizeOpEnvelopes } from "./lotSheetOps";
import { applyOperationPage, createPendingBatch, parsePendingBatch } from "./syncCore";
import type { LotSheet } from "./types";

const blank = (): LotSheet => ({
  cells: {},
  lots: { north: [], east: [], fence: [], bay: ["", "", ""] },
  locks: [],
});

describe("lot sheet operations", () => {
  it("keeps unrelated concurrent cell edits", () => {
    const sheet = applyLotSheetOpsToSheet(blank(), [
      { type: "set_cell", id: "row-1", value: "6401" },
      { type: "set_cell", id: "row-2", value: "6402" },
    ]);
    expect(sheet.cells).toEqual({ "row-1": "6401", "row-2": "6402" });
  });

  it("uses the later operation when two clients edit the same target", () => {
    const sheet = applyLotSheetOpsToSheet(blank(), [
      { type: "set_cell", id: "row-1", value: "6401" },
      { type: "set_cell", id: "row-1", value: "6501" },
    ]);
    expect(sheet.cells["row-1"]).toBe("6501");
  });

  it("moves a bus atomically and never leaves a duplicate", () => {
    const start: LotSheet = {
      ...blank(),
      cells: { "row-1": "6401", "row-2": "6501" },
      lots: { north: ["6401"], east: [], fence: [], bay: ["", "6401", ""] },
    };
    const moved = applyLotSheetOp(start, {
      type: "move_bus",
      bus: "6401",
      destination: { kind: "cell", id: "row-3" },
    });
    expect(moved.cells).toEqual({ "row-2": "6501", "row-3": "6401" });
    expect(moved.lots.north).toEqual([]);
    expect(moved.lots.bay).toEqual(["", "", ""]);
  });

  it("removes a bus from other locations when a list edit adds it", () => {
    const start: LotSheet = {
      ...blank(),
      cells: { "row-1": "6567" },
      lots: { north: [], east: [], fence: ["6567"], southlane: ["6620"], bay: ["", "6567", ""] },
    };
    const edited = applyLotSheetOp(start, {
      type: "set_lot",
      key: "southlane",
      value: ["6620", "6567"],
    });
    expect(edited.lots.southlane).toEqual(["6620", "6567"]);
    expect(edited.lots.fence).toEqual([]);
    expect(edited.lots.bay).toEqual(["", "", ""]);
    expect(edited.cells).toEqual({});
  });

  it("leaves other locations alone when a list edit only reorders or removes", () => {
    const start: LotSheet = {
      ...blank(),
      lots: { north: [], east: [], fence: ["6567"], southlane: ["6620", "6621"], bay: ["X", "", ""] },
    };
    const reordered = applyLotSheetOp(start, {
      type: "set_lot",
      key: "southlane",
      value: ["6621", "6620"],
    });
    expect(reordered.lots.fence).toEqual(["6567"]);
    // The bay's "X" out-of-use marker is not a bus — setting it must not
    // ripple through other lists.
    const bayMarked = applyLotSheetOp(start, {
      type: "set_lot",
      key: "bay",
      value: ["X", "X", ""],
    });
    expect(bayMarked.lots.southlane).toEqual(["6620", "6621"]);
  });

  it("preserves locked cells during an explicit grid clear", () => {
    const cleared = applyLotSheetOp(
      { ...blank(), cells: { a: "6401", b: "6402" }, locks: ["b"] },
      { type: "clear_grid", preserveLocks: true }
    );
    expect(cleared.cells).toEqual({ b: "6402" });
    expect(cleared.locks).toEqual(["b"]);
  });

  it("accepts legacy bare operations and stable envelopes", () => {
    const normalized = normalizeOpEnvelopes([
      { type: "set_cell", id: "a", value: "1" },
      { opId: "device-2", baseRevision: 4, op: { type: "set_cell", id: "b", value: "2" } },
    ]);
    expect(normalized[0].opId).toBeUndefined();
    expect(normalized[1]).toMatchObject({ opId: "device-2", baseRevision: 4 });
  });

  it("persists a retryable browser outbox with the same operation ids", () => {
    let n = 0;
    const batch = createPendingBatch(
      [{ type: "set_cell", id: "a", value: "6401" }],
      { ...blank(), cells: { a: "6401" } },
      7,
      () => `op-${++n}`
    );
    const restored = parsePendingBatch(JSON.stringify(batch));
    expect(restored?.entries[0]).toMatchObject({ opId: "op-1", baseRevision: 7 });
    expect(restored?.snapshot.cells.a).toBe("6401");
  });

  it("applies paged records in revision order and advances only to the last applied record", () => {
    const page = applyOperationPage(blank(), 10, [
      { revision: 12, op: { type: "set_cell", id: "b", value: "2" } },
      { revision: 11, op: { type: "set_cell", id: "a", value: "1" } },
    ]);
    expect(page.revision).toBe(12);
    expect(page.sheet.cells).toEqual({ a: "1", b: "2" });
  });

  it("creates unique envelopes without changing operation contents", () => {
    let n = 0;
    const entries = createOpEnvelopes(
      [
        { type: "set_field", field: "time", value: "8:00 AM / 0800" },
        { type: "set_cell", id: "a", value: "6401" },
      ],
      42,
      () => `id-${++n}`
    );
    expect(entries.map((entry) => entry.opId)).toEqual(["id-1", "id-2"]);
    expect(entries.every((entry) => entry.baseRevision === 42)).toBe(true);
  });
});
