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
import { Button, Chip, ResponsiveDialog } from "../../ui";
import styles from "./MApp.module.css";

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
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Move bus ${bus}`}
      description="Choose its new garage location."
      size="md"
      footer={(close) => <Button onPress={close}>Cancel</Button>}
    >
      <div className={styles.moveSections}>
        <section className={styles.moveSection}>
        <h3>Lots</h3>
        <div className={styles.chips}>
          {QUICK_LOTS.map((l) => (
            <Chip key={l.key} onPress={() => go({ lotKey: l.key }, l.label)}>
              {l.label}
            </Chip>
          ))}
        </div>
        </section>

        <section className={styles.moveSection}>
        <h3>Shop bays</h3>
        <div className={styles.chips}>
          {Array.from({ length: 10 }, (_, i) => {
            const taken = !!bays[i] && bays[i] !== bus;
            const xed = bays[i] === "X";
            if (xed) return null;
            return (
              <Chip
                key={i}
                isDisabled={taken}
                onPress={() => go({ lotKey: "bay", lotIndex: i }, `Bay ${i + 1}`)}
              >
                Bay {i + 1}
              </Chip>
            );
          })}
        </div>
        </section>

        <section className={styles.moveSection}>
        <h3>Grid spot</h3>
        <div className={styles.chips}>
          {Array.from({ length: COLUMN_COUNT }, (_, c) => (
            <Chip
              key={c}
              isSelected={row === c}
              tone={row === c ? "accent" : "neutral"}
              onPress={() => setRow(row === c ? null : c)}
            >
              R{c + 1}
            </Chip>
          ))}
        </div>
        {row !== null && (
          <div className={styles.chips}>
            {emptySpots.length === 0 && <div className={styles.hint}>Row {row + 1} is full.</div>}
            {emptySpots.map((s) => (
              <Chip
                key={s.id}
                onPress={() => go({ cellId: s.id }, `Row ${row + 1} · ${s.label === "OUT" ? "front" : "#" + s.label}`)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        )}
        </section>
      </div>
    </ResponsiveDialog>
  );
}
