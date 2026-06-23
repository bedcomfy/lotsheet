"use client";

import { Fragment, useRef, useState } from "react";
import {
  SLOTS,
  FRONT_COLUMNS,
  frontCellId,
  numberedCellId,
  row11CellId,
} from "../lib/grid";
import { isKnownBus } from "../lib/buses";

function sanitizeBus(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d && d[0] !== "2" && d[0] !== "6") d = "";
  return d.slice(0, 5);
}

// Garage rows are walked two at a time. (0-indexed; ROW 11 stands alone.)
const PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10]];

// Top-to-bottom positions in one garage row column: the outside (front) bus
// for ROW 1–6, then each slot going back.
function columnCells(c) {
  const out = [];
  if (c < FRONT_COLUMNS) out.push({ id: frontCellId(c), label: "Out" });
  for (let b = 0; b < SLOTS.length; b++) {
    const slot = SLOTS[b][c];
    if (slot === "X") out.push({ blocked: true });
    else if (slot === null) out.push({ id: row11CellId(b), label: String(b + 1) });
    else out.push({ id: numberedCellId(slot), label: String(slot) });
  }
  return out;
}

export default function RowFill({ getNum, saveNum, onClose }) {
  const [pair, setPair] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const inputs = useRef({});

  let [a, b] = PAIRS[pair];
  if (swapped && b != null) [a, b] = [b, a];

  const colA = columnCells(a);
  const colB = b != null ? columnCells(b) : null;
  const rows = Math.max(colA.length, colB ? colB.length : 0);

  // Side-to-side focus order: row A then row B at each position, skipping blocked.
  const order = [];
  for (let i = 0; i < rows; i++) {
    if (colA[i] && !colA[i].blocked) order.push(colA[i].id);
    if (colB && colB[i] && !colB[i].blocked) order.push(colB[i].id);
  }
  function focusNext(id) {
    const next = order[order.indexOf(id) + 1];
    if (next && inputs.current[next]) inputs.current[next].focus();
  }

  // NOTE: rendered inline (not as a <Box> component) so the inputs keep focus
  // across re-renders instead of remounting on every keystroke.
  function renderBox(cell) {
    if (!cell) return <div className="rf__box rf__box--empty" />;
    if (cell.blocked) return <div className="rf__box rf__box--blocked">X</div>;
    const id = cell.id;
    const val = getNum(id);
    const invalid = val.length >= 4 && !isKnownBus(val);
    return (
      <label className={`rf__box ${invalid ? "rf__box--invalid" : ""}`}>
        <span className="rf__label">{cell.label}</span>
        <input
          ref={(el) => {
            if (el) inputs.current[id] = el;
          }}
          className="rf__input"
          inputMode="numeric"
          enterKeyHint="next"
          value={val}
          onChange={(e) => {
            const v = sanitizeBus(e.target.value);
            saveNum(id, v);
            // Auto-advance as soon as a real bus number is entered (most are
            // 4 digits, and the iOS number pad has no "next" key).
            if (isKnownBus(v)) focusNext(id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNext(id);
            }
          }}
        />
      </label>
    );
  }

  const titleA = `ROW ${a + 1}`;
  const titleB = b != null ? `ROW ${b + 1}` : null;

  function go(delta) {
    setPair((p) => Math.max(0, Math.min(PAIRS.length - 1, p + delta)));
    setSwapped(false);
  }

  return (
    <div className="manager no-print">
      <div className="manager__inner">
        <div className="manager__bar">
          <div className="manager__title">Fill Rows</div>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="rf__nav">
          <button className="btn" onClick={() => go(-1)} disabled={pair === 0}>
            ‹ Prev
          </button>
          <div className="rf__which">
            {titleA}
            {titleB ? ` & ${titleB}` : ""}
          </div>
          {titleB && (
            <button className="btn btn--mini" onClick={() => setSwapped((s) => !s)}>
              ⇄ Swap
            </button>
          )}
          <button className="btn" onClick={() => go(1)} disabled={pair === PAIRS.length - 1}>
            Next ›
          </button>
        </div>
        <div className="rf__hint">
          Tap a box and type the bus number. The keyboard’s “next” jumps side-to-side
          (outside buses first, then back through the row).
        </div>

        <div
          className="rf__grid"
          style={{ gridTemplateColumns: colB ? "1fr 1fr" : "1fr" }}
        >
          <div className="rf__colhead">{titleA}</div>
          {titleB && <div className="rf__colhead">{titleB}</div>}
          {Array.from({ length: rows }).map((_, i) => (
            <Fragment key={i}>
              {renderBox(colA[i])}
              {colB && renderBox(colB[i])}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
