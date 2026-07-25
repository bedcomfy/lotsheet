"use client";

import { useEffect, useRef, useState } from "react";
import { typeInfo } from "../lib/grid";
import { Flag, Ban, Lock, Unlock, Eraser, ChevronRight } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import FlagPills from "./FlagPills";
import { useBusMaster } from "./BusMasterProvider";
import type { FlagEntry, FlagMap } from "../lib/types";
import {
  Button,
  ResponsiveDialog,
  StatusBadge,
  TextField,
} from "../ui";
import styles from "./CellEditor.module.css";

interface CellEditorProps {
  subLabel?: string;
  value?: string;
  flags?: FlagMap;
  cellId: string;
  locate?: (bus: string, exceptId: string | null) => string;
  onRelocate?: (bus: string) => void; // remove the bus from wherever it currently sits
  onEditFlags?: (bus: string) => void; // jump straight into this bus's flag editor
  sendTargets?: { key: string; label: string }[]; // lots this bus can be sent to
  onSendToLot?: (bus: string, lotKey: string) => void;
  blockable?: boolean; // allow marking the spot unusable (an "X", like ROW 10's)
  locked?: boolean; // this spot's bus survives "Clear Grid"
  onToggleLock?: () => void;
  onSave: (v: string) => void;
  onClose: () => void;
}

export default function CellEditor({ subLabel, value, flags, cellId, locate, onRelocate, onEditFlags, sendTargets, onSendToLot, blockable, locked, onToggleLock, onSave, onClose }: CellEditorProps) {
  const { isKnown: isKnownBus, types: busTypes, label: busLabel } = useBusMaster();
  const [num, setNum] = useState(value || "");
  const [dup, setDup] = useState(""); // where this bus already sits, if anywhere
  const inputRef = useRef<HTMLInputElement>(null);

  // Save unless the bus is already placed elsewhere on the sheet.
  function trySave(v?: string) {
    const n = (v ?? num).trim();
    if (n) {
      const where = locate ? locate(n, cellId) : "";
      if (where) {
        setDup(where);
        return;
      }
    }
    onSave(n);
  }

  // The bus is somewhere else — pull it out of there and drop it here.
  function moveHere() {
    const n = num.trim();
    onRelocate?.(n);
    onSave(n);
  }

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const known = isKnownBus(num);
  const showWarning = num.length >= 4 && !known;

  const entry: FlagEntry | null = num && flags ? flags[num] || null : null;
  const types = num ? busTypes(num) : [];
  const typeLabels = types
    .map((t) => typeInfo(t)?.label)
    .filter(Boolean)
    .join(" · ");
  const note = (entry?.note || "").trim();
  const hasFlagContent = (entry?.flags || []).length > 0 || !!note;
  const isBus = num.length >= 4 && known;

  // Quiet secondary actions only when they apply to this spot.
  const showClear = !!value && value !== "X";
  const showLock = !!onToggleLock && !!value && value !== "X" && num === value;
  const hasSecondary = showClear || blockable || showLock;

  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Bus number"
      description={subLabel}
      size="sm"
      bodyClassName={styles.body}
      footer={(close) => (
        <>
          <Button variant="quiet" onPress={close}>
            Cancel
          </Button>
          <Button variant="primary" onPress={() => trySave()}>
            Save
          </Button>
        </>
      )}
    >
      <TextField
        inputRef={inputRef}
        label="Bus number"
        labelHidden
        value={num}
        inputMode="numeric"
        autoFocus
        onFocus={() => inputRef.current?.select()}
        onChange={(value) => {
          const v = sanitizeBus(value);
          setNum(v);
          setDup("");
          // Autocomplete: save & close the moment a valid bus is entered,
          // matching the lot editor and Fill Rows (blocked if it's a duplicate).
          if (isKnownBus(v)) trySave(v);
        }}
        placeholder="Bus number"
        onKeyDown={(e) => {
          if (e.key === "Enter") trySave();
        }}
      />
      {dup && (
        <div className={styles.warning}>
          <p>
            Bus {busLabel(num)} is currently at <strong>{dup}</strong>.
          </p>
          <div className={styles.warningActions}>
            <Button size="sm" variant="primary" onPress={moveHere}>
              Move it here
            </Button>
            <Button size="sm" onPress={() => setDup("")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {showWarning && !dup && (
        <div className={styles.warning}>
          {num} isn&apos;t on the bus list — double-check it. You can still save it.
        </div>
      )}

      {isBus && (
        <>
          <StatusBadge tone="success">
            On the list{typeLabels ? ` · ${typeLabels}` : ""}
          </StatusBadge>
          {onEditFlags && (
            <Button
              className={styles.flagButton}
              variant="quiet"
              onPress={() => onEditFlags(num)}
              aria-label={`Edit flags for bus ${busLabel(num)}`}
            >
              {hasFlagContent ? (
                <span className={styles.flagPills}>
                  <FlagPills entry={entry} />
                </span>
              ) : (
                <span className={styles.addFlags}>
                  <Flag aria-hidden="true" /> Add flags
                </span>
              )}
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </Button>
          )}
        </>
      )}

      {/* Send the bus that's parked in this cell straight to a lot — no dragging. */}
      {onSendToLot && !!sendTargets?.length && value && value !== "X" && num === value && (
        <div className={styles.sendRow}>
          <span className={styles.actionLabel}>Send to</span>
          {sendTargets.map((t) => (
            <Button key={t.key} size="sm" onPress={() => onSendToLot(num, t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      )}

      {hasSecondary && (
        <div className={styles.secondary}>
          {showClear && (
            <Button variant="danger" size="sm" onPress={() => onSave("")}>
              <Eraser aria-hidden="true" /> Clear
            </Button>
          )}
          {blockable && (
            <Button
              size="sm"
              onPress={() => onSave(value === "X" ? "" : "X")}
            >
              <Ban aria-hidden="true" /> {value === "X" ? "Unblock" : "Block"}
            </Button>
          )}
          {showLock && (
            <Button
              size="sm"
              onPress={onToggleLock}
            >
              {locked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />} {locked ? "Unlock" : "Lock"}
            </Button>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
