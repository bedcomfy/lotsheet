"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Flag, GripVertical, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import FlagPills from "./FlagPills";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import type { FlagEntry, FlagMap } from "../lib/types";
import { Button, Pressable, ResponsiveDialog, TextField } from "../ui";
import styles from "./LotEditor.module.css";

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
  onClearRequest?: () => void;
  onClose: () => void;
}

// One sortable row. Top-level so its identity survives LotEditor re-renders
// (an inline component would remount mid-drag and break dnd).
interface LotRowProps {
  sortId: string;
  bus: string;
  i: number;
  count: number;
  entry?: FlagEntry | null;
  sortable: boolean;
  onEditFlags?: (bus: string) => void;
  onMove: (i: number, dir: number) => void;
  onRemove: (i: number) => void;
}

function LotRow({ sortId, bus, i, count, entry, sortable, onEditFlags, onMove, onRemove }: LotRowProps) {
  const { label: busLabel } = useBusMaster();
  const s = useSortable({ id: sortId, disabled: !sortable });
  const hasFlags = !!(entry && ((entry.flags || []).length > 0 || (entry.note || "").trim()));
  return (
    <div
      ref={s.setNodeRef}
      className={`${styles.row} ${s.isDragging ? styles.rowDragging : ""}`}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
    >
      {sortable && (
        <button
          type="button"
          className={styles.grip}
          {...s.attributes}
          {...s.listeners}
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical size={15} />
        </button>
      )}
      <div className={styles.rowInfo}>
        <span className={styles.index}>{i + 1}.</span>
        <span className={styles.bus}>{busLabel(bus)}</span>
        <TypeCodes num={bus} variant="ui" />
        {/* Flags as colored pills; the whole area taps into the flag editor
            (an "add flags" hint shows when the bus has none). */}
        {onEditFlags ? (
          <Pressable className={styles.flags} onPress={() => onEditFlags(bus)} aria-label="Edit this bus's flags">
            {hasFlags ? <FlagPills entry={entry} /> : <span className={styles.addFlags}><Flag size={12} /> Add flags</span>}
          </Pressable>
        ) : (
          hasFlags && <span className={styles.flagPills}><FlagPills entry={entry} /></span>
        )}
      </div>
      <div className={styles.rowActions}>
        <Pressable className={styles.move} onPress={() => onMove(i, -1)} isDisabled={i === 0} aria-label="Move up">
          <ChevronUp size={17} />
        </Pressable>
        <Pressable
          className={styles.move}
          onPress={() => onMove(i, 1)}
          isDisabled={i === count - 1}
          aria-label="Move down"
        >
          <ChevronDown size={17} />
        </Pressable>
        <Pressable className={styles.remove} onPress={() => onRemove(i)} aria-label={`Remove ${busLabel(bus)}`}>
          <Trash2 size={16} />
        </Pressable>
      </div>
    </div>
  );
}

export default function LotEditor({ title, subtitle, list, flags = {}, locate, onRelocate, onEditFlags, recent, onAdd, onRemove, onMove, onReorder, onClearRequest, onClose }: LotEditorProps) {
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
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={subtitle || "Buses print on the back in the order you add them."}
      size="md"
      bodyClassName={styles.body}
      footer={(close) => (
        <>
          {onClearRequest && (
            <Button
              className={styles.clearButton}
              variant="danger"
              isDisabled={!list.some((bus) => bus && bus !== "X")}
              onPress={onClearRequest}
            >
              <Trash2 aria-hidden="true" /> Clear {title}
            </Button>
          )}
          <Button variant="primary" onPress={close}>
            Done
          </Button>
        </>
      )}
    >
        <div className={styles.addRow}>
          <TextField
            className={styles.input}
            inputRef={ref}
            label="Bus number"
            labelHidden
            value={val}
            inputMode="numeric"
            placeholder="Bus number"
            autoFocus
            onChange={onChange}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button variant="primary" onPress={() => add()}>
            Add
          </Button>
        </div>
        {dup && (
          <div className={styles.warning}>
            <span>Bus {busLabel(val)} is currently at <strong>{dup}</strong>.</span>
            <div className={styles.warningActions}>
              <Button variant="primary" size="sm" onPress={moveHere}>
                Move it here
              </Button>
              <Button size="sm" onPress={() => { setDup(""); setVal(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {showWarn && !dup && (
          <div className={styles.warning}>
            {val} isn&apos;t on the bus list — double-check it. Press Add to use it anyway.
          </div>
        )}

        {/* Buses recently taken off the sheet — tap to add them here. */}
        {!!recent?.length && (
          <div className={styles.recent}>
            <span className={styles.recentLabel}>Recent</span>
            {recent.map((b) => (
              <Pressable key={b} className={styles.recentChip} onPress={() => add(b)}>
                {busLabel(b)}
              </Pressable>
            ))}
          </div>
        )}

        <DndContext id="lot-editor-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            <div className={styles.list}>
              {list.length === 0 && (
                <div className={styles.empty}>No buses yet — type a number and press Add.</div>
              )}
              {list.map((bus, i) => (
                <LotRow
                  key={sortIds[i]}
                  sortId={sortIds[i]}
                  bus={bus}
                  i={i}
                  count={list.length}
                  entry={flags[bus]}
                  sortable={!!onReorder}
                  onEditFlags={onEditFlags}
                  onMove={onMove}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

    </ResponsiveDialog>
  );
}
