"use client";

// The Walk — Fill Rows' proven workflow (row pairs, Berto grouping, swap,
// auto-advance, duplicate catch) rebuilt phone-native: big spot targets and a
// docked keypad we own, so the OS keyboard never exists and nothing reflows.
// Reads the shared ["sheet"] cache; writes set_cell ops through useCellOps.

import { useEffect, useMemo, useState } from "react";
import {
  SLOTS,
  FRONT_COLUMNS,
  COLUMN_COUNT,
  frontCellId,
  numberedCellId,
  row11CellId,
  cellLocationLabel,
} from "../../lib/grid";
import { useLotSheet } from "../../lib/queries";
import { useBusMaster } from "../BusMasterProvider";
import { useCellOps, cellNum } from "./useCellOps";
import type { LotSheet } from "../../lib/types";

// The same walking groups as desktop Fill Rows (0-indexed grid columns).
const PAIRS: number[][] = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10]];
const BERTO: number[][] = [[0, 1], [2, 3, 4, 5], [6, 7], [8, 9], [10]];
const BERTO_KEY = "pace:rowfill:berto"; // shared with desktop Fill Rows

interface Cell {
  id: string;
  label: string;
  blocked?: boolean;
}

// Top-to-bottom spots in one garage row: the outside (front) bus for ROW 1–6,
// then each slot going back. Mirrors desktop Fill Rows exactly.
function columnCells(c: number): Cell[] {
  const out: Cell[] = [];
  if (c < FRONT_COLUMNS) out.push({ id: frontCellId(c), label: "OUT" });
  for (let b = 0; b < SLOTS.length; b++) {
    const slot = SLOTS[b][c];
    if (slot === "X") out.push({ id: `x${b}_${c}`, label: "", blocked: true });
    else if (slot === null) out.push({ id: row11CellId(b), label: String(b + 1) });
    else out.push({ id: numberedCellId(slot as number), label: String(slot) });
  }
  return out;
}

const LOT_LABELS: Record<string, string> = {
  north: "North Lot", east: "East Lot", fence: "Fence", rc: "R/C", apron: "Apron",
  northlane: "North Lane", southlane: "South Lane", bay: "Bay", cards: "Cards",
};

// Where a bus already sits (grid spot id, or a lot label) — the duplicate catch.
function locate(sheet: LotSheet | null | undefined, bus: string, exceptId: string): { cellId?: string; label: string } | null {
  if (!sheet || !bus) return null;
  for (const [id, v] of Object.entries(sheet.cells || {})) {
    if (id !== exceptId && cellNum(v) === bus) {
      return { cellId: id, label: cellLocationLabel(id) || id };
    }
  }
  for (const [key, arr] of Object.entries(sheet.lots || {})) {
    if (Array.isArray(arr) && arr.includes(bus)) return { label: LOT_LABELS[key] || key };
  }
  return null;
}

export default function MWalk({ toast }: { toast: (msg: string) => void }) {
  const { data } = useLotSheet();
  const sheet = data?.sheet || null;
  const { isKnown } = useBusMaster();
  const { setCell, moveCell } = useCellOps();

  const [berto, setBerto] = useState(false);
  const [group, setGroup] = useState(1); // R3·R4 by default, like walking in
  const [swapped, setSwapped] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [dup, setDup] = useState<{ bus: string; label: string; cellId?: string } | null>(null);

  useEffect(() => {
    try { setBerto(localStorage.getItem(BERTO_KEY) === "1"); } catch {}
  }, []);

  const getNum = (id: string) => cellNum(sheet?.cells?.[id]);
  const groups = berto ? BERTO : PAIRS;
  const cols = useMemo(() => {
    let g = [...(groups[group] || groups[0])];
    if (swapped && g.length > 1) g.reverse();
    return g;
  }, [groups, group, swapped]);
  const colCellsList = useMemo(() => cols.map(columnCells), [cols]);

  // Walk order: across the group at each depth — outside buses first, then back
  // through the rows (desktop Fill Rows' focus order).
  const order = useMemo(() => {
    const depth = Math.max(...colCellsList.map((c) => c.length));
    const seq: string[] = [];
    for (let i = 0; i < depth; i++) {
      for (const col of colCellsList) {
        const cell = col[i];
        if (cell && !cell.blocked) seq.push(cell.id);
      }
    }
    return seq;
  }, [colCellsList]);

  // Auto-skip: the next spot that is not blocked, not X'd, and not filled.
  function nextEmpty(fromId: string | null): string | null {
    const start = fromId ? order.indexOf(fromId) + 1 : 0;
    for (let i = 0; i < order.length; i++) {
      const id = order[(start + i) % order.length];
      if (!getNum(id)) return id;
    }
    return null;
  }

  // Aim at the first empty spot whenever the group changes (or data arrives).
  useEffect(() => {
    setVal("");
    setDup(null);
    setFocus(nextEmpty(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, berto, swapped, !!sheet]);

  function stats(c: number) {
    const cells = columnCells(c).filter((x) => !x.blocked);
    const filled = cells.filter((x) => {
      const n = getNum(x.id);
      return n && n !== "X";
    }).length;
    const total = cells.filter((x) => getNum(x.id) !== "X").length;
    return { filled, total };
  }
  const groupStats = (g: number[]) =>
    g.map(stats).reduce((a, s) => ({ filled: a.filled + s.filled, total: a.total + s.total }), { filled: 0, total: 0 });

  function toggleBerto() {
    const next = !berto;
    setBerto(next);
    setGroup(1);
    setSwapped(false);
    try { localStorage.setItem(BERTO_KEY, next ? "1" : "0"); } catch {}
  }

  function key(k: string) {
    if (!focus) return;
    setDup(null);
    if (k === "skip") {
      setVal("");
      setFocus(nextEmpty(focus));
      return;
    }
    if (k === "back") {
      setVal((v) => v.slice(0, -1));
      return;
    }
    if (k === "clear") {
      if (getNum(focus)) {
        setCell(focus, "");
        toast("Spot cleared");
      }
      setVal("");
      return;
    }
    if (val.length >= 5) return;
    const next = val + k;
    setVal(next);
    // Auto-place the moment the number is a real bus (desktop's auto-advance).
    if (next.length >= 4 && isKnown(next)) place(next);
  }

  function place(bus: string) {
    if (!focus) return;
    const where = locate(sheet, bus, focus);
    if (where) {
      setDup({ bus, ...where });
      setVal("");
      return;
    }
    commit(bus);
  }

  function commit(bus: string, moveFrom?: string) {
    if (!focus) return;
    if (moveFrom) moveCell(moveFrom, focus, bus);
    else setCell(focus, bus);
    toast(`${bus} placed — next spot ready`);
    setVal("");
    setDup(null);
    setFocus(nextEmpty(focus));
  }

  const focusLabel = (id: string) => {
    for (let ci = 0; ci < colCellsList.length; ci++) {
      const cell = colCellsList[ci].find((x) => x.id === id);
      if (cell) return `R${cols[ci] + 1} · ${cell.label === "OUT" ? "OUT" : "#" + cell.label}`;
    }
    return "";
  };

  const focusedFilled = focus ? !!getNum(focus) : false;
  const st = groupStats(cols);

  return (
    <>
      <div className="mwalkbar">
        <div className="mpairs">
          {groups.map((g, i) => {
            const s = groupStats(g);
            return (
              <button
                key={i}
                type="button"
                className={`mpairbtn ${i === group ? "mpairbtn--on" : ""} ${s.total > 0 && s.filled === s.total ? "mpairbtn--full" : ""}`}
                onClick={() => { setGroup(i); setSwapped(false); }}
              >
                <b>R{g.map((c) => c + 1).join("·")}</b>
                <span>{s.filled}/{s.total}</span>
              </button>
            );
          })}
        </div>
        <div className="mwalkopts">
          <button type="button" className={`moptchip ${berto ? "moptchip--on" : ""}`} onClick={toggleBerto}>
            Berto
          </button>
          {cols.length > 1 && (
            <button type="button" className="moptchip" onClick={() => setSwapped((s) => !s)}>
              ⇄ Swap
            </button>
          )}
          <span className="mwalkmeta">{st.filled}/{st.total}</span>
        </div>
      </div>

      <div
        className={`mwalkcols ${cols.length > 2 ? "mwalkcols--multi" : ""}`}
        style={{ gridTemplateColumns: `repeat(${cols.length},1fr)` }}
      >
        {cols.map((c, ci) => (
          <div className="mwcol" key={c}>
            <div className="mwcol__head">ROW {c + 1}</div>
            {colCellsList[ci].map((cell, idx) => {
              if (cell.blocked) {
                return (
                  <div className="mwspot mwspot--blocked" key={idx}>
                    <small></small>
                    <b>✕</b>
                  </div>
                );
              }
              const n = getNum(cell.id);
              const xed = n === "X";
              return (
                <button
                  type="button"
                  key={cell.id}
                  className={`mwspot ${n ? "" : "mwspot--empty"} ${focus === cell.id ? "mwspot--focus" : ""} ${xed ? "mwspot--blocked" : ""}`}
                  onClick={() => { setFocus(cell.id); setVal(""); setDup(null); }}
                >
                  <small>{cell.label}</small>
                  <b>{xed ? "✕" : n || (focus === cell.id ? "type…" : "empty")}</b>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {focus && (
        <div className="mdockpad">
          <div className="mdockpad__row">
            <span className="mdockpad__target">
              {focusLabel(focus)} <span>{focusedFilled ? "filled" : "next up"}</span>
            </span>
            <span className="mdockpad__out">{val || " "}</span>
            <button type="button" className="mdockpad__hide" onClick={() => setFocus(null)} aria-label="Hide keypad">
              ✕
            </button>
          </div>
          <div className="mdockpad__msg">
            {dup && (
              <>
                {dup.bus} is already at <b>{dup.label}</b>
                {dup.cellId && (
                  <button type="button" onClick={() => commit(dup.bus, dup.cellId)}>move here</button>
                )}
              </>
            )}
            {!dup && val.length >= 4 && !isKnown(val) && "Not a known bus — keep typing or ⌫"}
          </div>
          <div className="mpad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button type="button" key={d} onClick={() => key(d)}>{d}</button>
            ))}
            <button type="button" className="mpad--txt" onClick={() => key(focusedFilled && !val ? "clear" : "back")}>
              {focusedFilled && !val ? "Clear" : "⌫"}
            </button>
            <button type="button" onClick={() => key("0")}>0</button>
            <button type="button" className="mpad--txt" onClick={() => key("skip")}>Skip ›</button>
          </div>
        </div>
      )}
    </>
  );
}
