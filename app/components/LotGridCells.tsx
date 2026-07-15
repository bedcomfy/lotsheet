"use client";

// The Lot Sheet grid's cell components, extracted from LotSheet.tsx verbatim.
// Top-level components (NOT defined inside LotSheet) so they keep their identity
// across re-renders — an inline component would remount mid-drag and break dnd.
// Every cell is a drop target; a cell with a bus is also draggable. Tap still
// opens the editor (mouse drags need ~6px of movement, touch a long-press).

import type { CSSProperties, ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import {
  frontCellId,
  flagDisplay,
  inspMilesDisplay,
  pinnedFlagText,
  alwaysPrintFlagIds,
  mostSevereFlag,
  flagColorStyle,
} from "../lib/grid";
import type { FlagEntry } from "../lib/types";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";

interface GridCellProps {
  id: string | null;
  slotLabel: string | number | null;
  num: string;
  entry: FlagEntry | null;
  selected?: boolean;
  foundBus?: string; // the searched bus — steady highlight while it matches
  locked?: boolean; // survives "Clear Grid"
  onOpen: (id: string, subLabel: string) => void;
}

export function GridCell({ id, slotLabel, num, entry, selected, foundBus, locked, onOpen }: GridCellProps) {
  const { label: busLabel } = useBusMaster();
  const blocked = slotLabel === "X"; // the form's own X (ROW 10) — not editable
  const xed = num === "X"; // user-blocked spot — tap to unblock via the editor
  const drag = useDraggable({ id: `cell:${id}`, data: { cellId: id, num }, disabled: !id || !num || xed });
  const drop = useDroppable({ id: `cell:${id}`, data: { cellId: id }, disabled: !id || xed });
  if (blocked) {
    return (
      <div className="cell cell--blocked">
        <span className="cell__x">X</span>
      </div>
    );
  }
  const found = !!foundBus && num === foundBus;
  const disp = entry ? flagDisplay(entry) : "";
  const miles = entry ? inspMilesDisplay(entry) : "";
  const pin = entry ? pinnedFlagText(entry) : "";
  const dispFlag = entry ? mostSevereFlag(entry.flags) : null;
  const pinFlag = entry ? alwaysPrintFlagIds().find((flag) => entry.flags.includes(flag)) || null : null;
  return (
    <button
      type="button"
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-cellid={id ?? undefined}
      className={`cell ${num && !xed ? "cell--filled" : ""} ${xed ? "cell--blocked" : ""} ${
        drag.isDragging ? "cell--dragsrc" : ""
      } ${drop.isOver ? "cell--dropover" : ""} ${selected ? "cell--selected" : ""} ${found ? "cell--found" : ""}`}
      onClick={() => onOpen(id!, slotLabel != null ? `Slot ${slotLabel}` : "ROW 11")}
    >
      {slotLabel != null && <span className="cell__slot">{slotLabel}</span>}
      {locked && num && !xed && (
        <span className="cell__lockicon no-print" title="Locked — survives Clear Grid">
          <Lock size={9} />
        </span>
      )}
      {xed ? (
        <span className="cell__x">X</span>
      ) : (
        <>
          {num && <TypeCodes num={num} className="cell__types" />}
          <span className="cell__num">{busLabel(num)}</span>
          {(disp || miles || pin) && (
            <span className="cell__meta">
              {disp && <span className="cell__flag" style={flagColorStyle(dispFlag) as CSSProperties}>{disp}</span>}
              {miles && <span className="cell__insp">{miles}</span>}
              {pin && <span className="cell__pin" style={flagColorStyle(pinFlag) as CSSProperties}>{pin}</span>}
            </span>
          )}
        </>
      )}
    </button>
  );
}

interface FrontCellProps {
  c: number;
  num: string;
  entry: FlagEntry | null;
  selected?: boolean;
  foundBus?: string;
  locked?: boolean;
  onOpen: (id: string, subLabel: string) => void;
}

export function FrontCell({ c, num, entry, selected, foundBus, locked, onOpen }: FrontCellProps) {
  const { label: busLabel } = useBusMaster();
  const id = frontCellId(c);
  const xed = num === "X";
  const drag = useDraggable({ id: `cell:${id}`, data: { cellId: id, num }, disabled: !num || xed });
  const drop = useDroppable({ id: `cell:${id}`, data: { cellId: id }, disabled: xed });
  const found = !!foundBus && num === foundBus;
  const disp = entry ? flagDisplay(entry) : "";
  const miles = entry ? inspMilesDisplay(entry) : "";
  const pin = entry ? pinnedFlagText(entry) : "";
  const dispFlag = entry ? mostSevereFlag(entry.flags) : null;
  const pinFlag = entry ? alwaysPrintFlagIds().find((flag) => entry.flags.includes(flag)) || null : null;
  return (
    <button
      type="button"
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-cellid={id}
      className={`front ${num && !xed ? "front--filled" : ""} ${xed ? "cell--blocked" : ""} ${
        drag.isDragging ? "cell--dragsrc" : ""
      } ${drop.isOver ? "cell--dropover" : ""} ${selected ? "cell--selected" : ""} ${found ? "cell--found" : ""}`}
      onClick={() => onOpen(id, `ROW ${c + 1} — front bus`)}
    >
      {locked && num && !xed && (
        <span className="cell__lockicon no-print" title="Locked — survives Clear Grid">
          <Lock size={9} />
        </span>
      )}
      {xed ? (
        <span className="cell__x">X</span>
      ) : (
        <>
          {num && <TypeCodes num={num} className="front__types" />}
          <span className="cell__num">{busLabel(num)}</span>
          {disp && <span className="front__flag" style={flagColorStyle(dispFlag) as CSSProperties}>{disp}</span>}
          {miles && <span className="front__flag front__insp">{miles}</span>}
          {pin && <span className="front__flag front__pin" style={flagColorStyle(pinFlag) as CSSProperties}>{pin}</span>}
        </>
      )}
    </button>
  );
}

// A back-of-sheet lot box that accepts a dragged bus (drops it at the end of
// that lot's list) and still opens the lot editor on tap.
export function BackLotBox({ lotKey, found, onOpen, children }: { lotKey: string; found?: boolean; onOpen: () => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lot:${lotKey}`, data: { lotKey } });
  return (
    <div
      ref={setNodeRef}
      data-lotkey={lotKey}
      className={`backlot ${isOver ? "backlot--dropover" : ""} ${found ? "backlot--found" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {children}
    </div>
  );
}
