"use client";

// Move a bus — from its card to anywhere: a lot, a shop bay, or an empty grid
// spot (pick a row, tap the spot). One atomic ops batch removes it from
// wherever it was.

import { useMemo, useState } from "react";
import {
  SLOTS,
  FRONT_COLUMNS,
  COLUMN_COUNT,
  frontCellId,
  numberedCellId,
  row11CellId,
} from "../../lib/grid";
import { useLotSheet } from "../../lib/queries";
import { useCellOps, cellNum } from "./useCellOps";

const QUICK_LOTS: { key: string; label: string }[] = [
  { key: "apron", label: "Apron" },
  { key: "cards", label: "Cards" },
  { key: "north", label: "North Lot" },
  { key: "east", label: "East Lot" },
  { key: "fence", label: "Fence" },
];

interface Cell {
  id: string;
  label: string;
}

function columnCells(c: number): Cell[] {
  const out: Cell[] = [];
  if (c < FRONT_COLUMNS) out.push({ id: frontCellId(c), label: "OUT" });
  for (let b = 0; b < SLOTS.length; b++) {
    const slot = SLOTS[b][c];
    if (slot === "X") continue;
    if (slot === null) out.push({ id: row11CellId(b), label: `11·${b + 1}` });
    else out.push({ id: numberedCellId(slot as number), label: String(slot) });
  }
  return out;
}

interface MMoveSheetProps {
  bus: string;
  onDone: (msg: string) => void;
  onClose: () => void;
}

export default function MMoveSheet({ bus, onDone, onClose }: MMoveSheetProps) {
  const { data } = useLotSheet();
  const sheet = data?.sheet || null;
  const { moveBus } = useCellOps();
  const [row, setRow] = useState<number | null>(null);

  const getNum = (id: string) => cellNum(sheet?.cells?.[id]);
  const bays = sheet?.lots?.bay || [];

  const emptySpots = useMemo(() => {
    if (row === null) return [];
    return columnCells(row).filter((c) => !getNum(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, sheet]);

  function go(dest: { cellId?: string; lotKey?: string; lotIndex?: number }, label: string) {
    moveBus(bus, dest);
    onDone(`${bus} → ${label}`);
  }

  return (
    <>
      <div className="mscrim" onClick={onClose} />
      <div className="mcard" role="dialog" aria-label={`Move bus ${bus}`}>
        <div className="mcard__grab" />
        <div className="mcard__body">
        <div className="mcard__top">
          <span className="mcard__num">{bus}</span>
          <span className="mcard__where">move to…</span>
        </div>

        <div className="mapp__sec">Lots</div>
        <div className="mbuschips">
          {QUICK_LOTS.map((l) => (
            <button type="button" key={l.key} className="mbuschip" onClick={() => go({ lotKey: l.key }, l.label)}>
              {l.label}
            </button>
          ))}
        </div>

        <div className="mapp__sec">Shop bays</div>
        <div className="mbuschips">
          {Array.from({ length: 10 }, (_, i) => {
            const taken = !!bays[i] && bays[i] !== bus;
            const xed = bays[i] === "X";
            if (xed) return null;
            return (
              <button
                type="button"
                key={i}
                className="mbuschip"
                disabled={taken}
                style={taken ? { opacity: 0.35 } : undefined}
                onClick={() => go({ lotKey: "bay", lotIndex: i }, `Bay ${i + 1}`)}
              >
                Bay {i + 1}
              </button>
            );
          })}
        </div>

        <div className="mapp__sec">Grid spot</div>
        <div className="mbuschips">
          {Array.from({ length: COLUMN_COUNT }, (_, c) => (
            <button
              type="button"
              key={c}
              className={`mbuschip ${row === c ? "mbuschip--onrow" : ""}`}
              onClick={() => setRow(row === c ? null : c)}
            >
              R{c + 1}
            </button>
          ))}
        </div>
        {row !== null && (
          <div className="mbuschips">
            {emptySpots.length === 0 && <div className="mhint">Row {row + 1} is full.</div>}
            {emptySpots.map((s) => (
              <button
                type="button"
                key={s.id}
                className="mbuschip"
                onClick={() => go({ cellId: s.id }, `Row ${row + 1} · ${s.label === "OUT" ? "front" : "#" + s.label}`)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        </div>
        <div className="mcard__acts mcard__footer">
          <button type="button" className="mactb" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
