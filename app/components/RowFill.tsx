"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  SLOTS,
  FRONT_COLUMNS,
  frontCellId,
  numberedCellId,
  row11CellId,
} from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import Overlay, { closeOverlayFromEvent } from "./Overlay";
import { useBusMaster } from "./BusMasterProvider";

// Garage rows are normally walked two at a time. (0-indexed; ROW 11 stands alone.)
const PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10]];
// "Berto" grouping: 1·2, then 3·4·5·6 together, then 7·8, 9·10, 11.
const BERTO_GROUPS = [[0, 1], [2, 3, 4, 5], [6, 7], [8, 9], [10]];

interface FillCell {
  id: string;
  label: string;
  blocked?: false;
}
interface BlockedCell {
  blocked: true;
}
type Cell = FillCell | BlockedCell;

// Top-to-bottom positions in one garage row column: the outside (front) bus
// for ROW 1–6, then each slot going back.
function columnCells(c: number): Cell[] {
  const out: Cell[] = [];
  if (c < FRONT_COLUMNS) out.push({ id: frontCellId(c), label: "Out" });
  for (let b = 0; b < SLOTS.length; b++) {
    const slot = SLOTS[b][c];
    if (slot === "X") out.push({ blocked: true });
    else if (slot === null) out.push({ id: row11CellId(b), label: String(b + 1) });
    else out.push({ id: numberedCellId(slot as number), label: String(slot) });
  }
  return out;
}

interface Dup {
  id: string;
  value: string;
  where: string;
}

interface RowFillProps {
  getNum: (id: string) => string;
  saveNum: (id: string, v: string) => void;
  locate?: (bus: string, exceptId: string | null) => string;
  onRelocate?: (bus: string) => void; // remove the bus from wherever it currently sits
  onClose: () => void;
}

export default function RowFill({ getNum, saveNum, locate, onRelocate, onClose }: RowFillProps) {
  const { isKnown: isKnownBus } = useBusMaster();
  const [berto, setBerto] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("pace:rowfill:berto") === "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [dup, setDup] = useState<Dup | null>(null); // a blocked duplicate
  const inputs = useRef<Record<string, HTMLInputElement>>({});

  const groups = berto ? BERTO_GROUPS : PAIRS;
  // The rows shown on this screen, left → right (swap reverses the order).
  let cols = [...groups[step]];
  if (swapped && cols.length > 1) cols.reverse();

  const colCells = cols.map(columnCells);
  const rows = colCells.reduce((m, cc) => Math.max(m, cc.length), 0);

  // Fill direction follows the LEFTMOST row: an even-index row (ROW 1, 3, …) on
  // the left means "start at the back" → fill bottom-to-top; otherwise top-down.
  const upward = cols[0] % 2 === 0;

  // Focus order: across all columns at each row position, skipping blocked cells.
  const order: string[] = [];
  for (let k = 0; k < rows; k++) {
    const i = upward ? rows - 1 - k : k;
    for (const cc of colCells) {
      const cell = cc[i];
      if (cell && !cell.blocked) order.push(cell.id);
    }
  }
  function focusNext(id: string) {
    const next = order[order.indexOf(id) + 1];
    if (next && inputs.current[next]) inputs.current[next].focus({ preventScroll: true });
  }

  // Start at the first box in the fill direction whenever the screen changes.
  useEffect(() => {
    const first = order[0];
    if (first && inputs.current[first]) inputs.current[first].focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, swapped, berto]);

  useEffect(() => {
    try {
      localStorage.setItem("pace:rowfill:berto", berto ? "1" : "0");
    } catch {}
  }, [berto]);

  // NOTE: rendered inline (not as a <Box> component) so the inputs keep focus
  // across re-renders instead of remounting on every keystroke.
  function renderBox(cell: Cell | undefined) {
    if (!cell) return <div className="rf__box rf__box--empty" />;
    if (cell.blocked) return <div className="rf__box rf__box--blocked">X</div>;
    const id = cell.id;
    const isDupHere = !!dup && dup.id === id;
    // Show the rejected duplicate value locally until it's changed; it is NOT
    // saved to the sheet, so a bus can't be entered in two places.
    const val = isDupHere && dup ? dup.value : getNum(id);
    const invalid = !isDupHere && val.length >= 4 && !isKnownBus(val);
    return (
      <label
        className={`rf__box ${invalid ? "rf__box--invalid" : ""} ${
          isDupHere ? "rf__box--dup" : ""
        }`}
      >
        <span className="rf__label">{cell.label}</span>
        <input
          ref={(el) => {
            if (el) inputs.current[id] = el;
          }}
          className="rf__input"
          inputMode="numeric"
          enterKeyHint="next"
          value={val}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = sanitizeBus(e.target.value);
            const where = v && locate ? locate(v, id) : "";
            if (where) {
              // Duplicate — don't save it; flag the box and stay put.
              setDup({ id, value: v, where });
              return;
            }
            setDup(null);
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
        {isDupHere && dup && (
          <span className="rf__dup">
            at {dup.where}
            <button
              type="button"
              className="rf__move"
              onClick={() => {
                onRelocate?.(dup.value);
                saveNum(dup.id, dup.value);
                setDup(null);
                focusNext(dup.id);
              }}
            >
              move here
            </button>
          </span>
        )}
      </label>
    );
  }

  const rowNums = cols.map((c) => c + 1);
  const which =
    rowNums.length === 1
      ? `ROW ${rowNums[0]}`
      : `ROW ${rowNums.slice(0, -1).join(", ")} & ${rowNums[rowNums.length - 1]}`;
  // How much of this screen is filled in — quick sense of what's left to walk.
  const filled = order.filter((cellId) => !!getNum(cellId)).length;

  function go(delta: number) {
    setStep((p) => Math.max(0, Math.min(groups.length - 1, p + delta)));
    setSwapped(false);
  }

  function toggleBerto() {
    setBerto((v) => !v);
    setStep(0);
    setSwapped(false);
  }

  return (
    <Overlay
      onClose={onClose}
      contentClassName="manager manager--rowfill no-print"
      label="Fill Rows"
    >
      <div className="manager__inner">
        <div className="manager__bar">
          <div className="manager__title">Fill Rows</div>
          <label className="toolbar__check">
            <input type="checkbox" checked={berto} onChange={toggleBerto} />
            Berto
          </label>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={closeOverlayFromEvent}>
            Done
          </button>
        </div>

        <div className="rf__nav">
          <button className="btn" onClick={() => go(-1)} disabled={step === 0}>
            ‹ Prev
          </button>
          <div className="rf__which">
            {which} <span className="rf__count">{filled}/{order.length}</span>
          </div>
          {cols.length > 1 && (
            <button className="btn btn--mini" onClick={() => setSwapped((s) => !s)}>
              ⇄ Swap
            </button>
          )}
          <button
            className="btn"
            onClick={() => go(1)}
            disabled={step === groups.length - 1}
          >
            Next ›
          </button>
        </div>
        <div className="rf__hint">
          Tap a box and type the bus number. The keyboard’s “next” jumps side-to-side
          (outside buses first, then back through the row).
        </div>

        <div
          className={`rf__grid ${cols.length > 2 ? "rf__grid--multi" : ""}`}
          style={{ gridTemplateColumns: cols.map(() => "1fr").join(" ") }}
        >
          {cols.map((c) => (
            <div className="rf__colhead" key={`h${c}`}>
              ROW {c + 1}
            </div>
          ))}
          {Array.from({ length: rows }).map((_, i) => (
            <Fragment key={i}>
              {colCells.map((cc, ci) => (
                <Fragment key={ci}>{renderBox(cc[i])}</Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
