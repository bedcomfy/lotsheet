"use client";

// The Walk — Fill Rows' proven workflow (row pairs, Berto grouping, swap,
// auto-advance, duplicate catch) rebuilt phone-native. Typing uses the REAL
// iOS keyboard on one persistent input: focus never leaves it between spots
// (so the keyboard stays open), the dock rides above the keyboard via the
// VisualViewport-driven --mkb, and the glowing spot auto-scrolls into view.
// Reads the shared ["sheet"] cache; writes set_cell ops through useCellOps.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useKeyboardInset } from "./useKeyboardInset";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const spotRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useKeyboardInset(); // publishes --mkb so the dock rides above the iOS keyboard

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

  // Whenever the walk advances, scroll the glowing spot into view (it may be
  // under the keyboard or the dock otherwise).
  useEffect(() => {
    if (!focus) return;
    const el = spotRefs.current[focus];
    el?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [focus]);

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

  function onType(raw: string) {
    if (!focus) return;
    setDup(null);
    const next = raw.replace(/\D/g, "").slice(0, 5);
    setVal(next);
    // Auto-place the moment the number is a real bus (desktop's auto-advance).
    // Focus stays in the same input, so the iOS keyboard never closes.
    if (next.length >= 4 && isKnown(next)) place(next);
  }

  function skip() {
    setDup(null);
    setVal("");
    setFocus(nextEmpty(focus));
    inputRef.current?.focus();
  }

  function clearSpot() {
    if (!focus) return;
    if (getNum(focus)) {
      setCell(focus, "");
      toast("Spot cleared");
    }
    setVal("");
    setDup(null);
    inputRef.current?.focus();
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
    inputRef.current?.focus(); // keep the iOS keyboard open for the next spot
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
                  ref={(el) => { spotRefs.current[cell.id] = el; }}
                  onClick={() => { setFocus(cell.id); setVal(""); setDup(null); inputRef.current?.focus(); }}
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
          <div className="mdock__inrow">
            <input
              ref={inputRef}
              className="mdock__input"
              inputMode="numeric"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="Bus number…"
              value={val}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (val.length >= 4 && isKnown(val)) place(val);
                  else skip();
                }
              }}
              aria-label="Bus number for the highlighted spot"
            />
            {focusedFilled && !val && (
              <button type="button" className="mdock__btn" onClick={clearSpot}>Clear</button>
            )}
            <button type="button" className="mdock__btn" onClick={skip}>Skip ›</button>
          </div>
        </div>
      )}
    </>
  );
}
