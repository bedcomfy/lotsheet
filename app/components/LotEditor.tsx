"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flagsFullDisplay } from "../lib/grid";
import { Flag, GripVertical } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import Overlay from "./Overlay";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import type { FlagMap } from "../lib/types";

interface LotEditorProps {
  title: string;
  subtitle?: string;
  list: string[];
  flags?: FlagMap;
  locate?: (bus: string, exceptId: string | null) => string;
  onRelocate?: (bus: string) => void; // remove the bus from wherever it currently sits
  onEditFlags?: (bus: string) => void; // jump straight into this bus's flag editor
  recent?: string[]; // buses recently taken off the sheet — one-tap re-add chips
  onAdd: (bus: string) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: number) => void;
  onReorder?: (from: number, to: number) => void; // drag-to-reorder
  onClose: () => void;
}

// One sortable row. Top-level so its identity survives LotEditor re-renders
// (an inline component would remount mid-drag and break dnd).
interface LotRowProps {
  sortId: string;
  bus: string;
  i: number;
  count: number;
  fdisp: string;
  sortable: boolean;
  onEditFlags?: (bus: string) => void;
  onMove: (i: number, dir: number) => void;
  onRemove: (i: number) => void;
}

function LotRow({ sortId, bus, i, count, fdisp, sortable, onEditFlags, onMove, onRemove }: LotRowProps) {
  const { label: busLabel } = useBusMaster();
  const s = useSortable({ id: sortId, disabled: !sortable });
  return (
    <div
      ref={s.setNodeRef}
      className={`lotitem ${s.isDragging ? "lotitem--dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
    >
      {sortable && (
        <button
          type="button"
          className="lotitem__grip"
          {...s.attributes}
          {...s.listeners}
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical size={15} />
        </button>
      )}
      <div className="lotitem__info">
        <span className="lotitem__idx">{i + 1}.</span>
        <span className="lotitem__bus">{busLabel(bus)}</span>
        <TypeCodes num={bus} />
        {fdisp && <span className="lotitem__flag">{fdisp}</span>}
      </div>
      <div className="lotitem__actions">
        {onEditFlags && (
          <button
            className="lotitem__move"
            onClick={() => onEditFlags(bus)}
            aria-label="Edit flags"
            title="Edit this bus's flags"
          >
            <Flag size={13} />
          </button>
        )}
        <button className="lotitem__move" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="Move up">
          ↑
        </button>
        <button
          className="lotitem__move"
          onClick={() => onMove(i, 1)}
          disabled={i === count - 1}
          aria-label="Move down"
        >
          ↓
        </button>
        <button className="busrow__clear" onClick={() => onRemove(i)}>
          Remove
        </button>
      </div>
    </div>
  );
}

export default function LotEditor({ title, subtitle, list, flags = {}, locate, onRelocate, onEditFlags, recent, onAdd, onRemove, onMove, onReorder, onClose }: LotEditorProps) {
  const { isKnown: isKnownBus, label: busLabel } = useBusMaster();
  const [val, setVal] = useState("");
  const [dup, setDup] = useState(""); // where this bus already sits, if anywhere
  const ref = useRef<HTMLInputElement>(null);

  // Reordering happens on the grip handle only, so taps on the row's buttons
  // never start a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );
  const sortIds = list.map((bus, i) => `${i}:${bus}`);
  function handleDragEnd(e: DragEndEvent) {
    if (!onReorder || !e.over || e.active.id === e.over.id) return;
    const from = sortIds.indexOf(String(e.active.id));
    const to = sortIds.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  function add(bus?: string) {
    const b = sanitizeBus(bus != null ? bus : val);
    if (b.length < 4) return;
    const where = locate ? locate(b, null) : "";
    if (where) {
      setDup(where);
      setVal(b);
      return;
    }
    onAdd(b);
    setVal("");
    setDup("");
    ref.current?.focus({ preventScroll: true });
  }

  // The bus is somewhere else — pull it out of there and add it here.
  function moveHere() {
    const b = sanitizeBus(val);
    if (b.length < 4) return;
    onRelocate?.(b);
    onAdd(b);
    setVal("");
    setDup("");
    ref.current?.focus({ preventScroll: true });
  }

  // Same check as the grid: warn about a number that isn't on the roster.
  const known = isKnownBus(val);
  const showWarn = val.length >= 4 && !known;

  function onChange(raw: string) {
    const v = sanitizeBus(raw);
    setDup("");
    // Autocomplete: as soon as a valid bus is typed, add it (like the grid /
    // Fill Rows auto-advance). Unknown numbers still add via the Add button.
    if (isKnownBus(v)) add(v);
    else setVal(v);
  }

  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal modal--tall"
      label={title}
      onOpenFocus={() => ref.current?.focus({ preventScroll: true })}
    >
        <div className="modal__head">
          <div>
            <div className="modal__title">{title}</div>
            <div className="modal__sub">{subtitle || "Buses print on the back in the order you add them."}</div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="lotadd">
          <input
            ref={ref}
            className="modal__input lotadd__input"
            value={val}
            inputMode="numeric"
            placeholder="Bus number"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn btn--primary" onClick={() => add()}>
            Add
          </button>
        </div>
        {dup && (
          <div className="modal__warn">
            Bus {busLabel(val)} is currently at <strong>{dup}</strong>.
            <div className="modal__warnactions">
              <button className="btn btn--primary btn--mini" onClick={moveHere}>
                Move it here
              </button>
              <button className="btn btn--mini" onClick={() => { setDup(""); setVal(""); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {showWarn && !dup && (
          <div className="modal__warn">
            {val} isn&apos;t on the bus list — double-check it. Press Add to use it anyway.
          </div>
        )}

        {/* Buses recently taken off the sheet — tap to add them here. */}
        {!!recent?.length && (
          <div className="recentrow">
            <span className="recentrow__lbl">Recent</span>
            {recent.map((b) => (
              <button key={b} type="button" className="recentchip" onClick={() => add(b)}>
                {busLabel(b)}
              </button>
            ))}
          </div>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            <div className="lotlist">
              {list.length === 0 && (
                <div className="lotlist__empty">No buses yet — type a number and press Add.</div>
              )}
              {list.map((bus, i) => (
                <LotRow
                  key={sortIds[i]}
                  sortId={sortIds[i]}
                  bus={bus}
                  i={i}
                  count={list.length}
                  fdisp={flagsFullDisplay(flags[bus])}
                  sortable={!!onReorder}
                  onEditFlags={onEditFlags}
                  onMove={onMove}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="modal__actions">
          <div className="toolbar__spacer" />
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
    </Overlay>
  );
}
