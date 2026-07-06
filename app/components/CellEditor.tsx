"use client";

import { useEffect, useRef, useState } from "react";
import { typeInfo, flagName, flagTier, inspMilesDisplay, retorqueTiresDisplay } from "../lib/grid";
import { Flag, Ban, Lock, Unlock, Eraser, ChevronRight } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import Overlay from "./Overlay";
import { useBusMaster } from "./BusMasterProvider";
import type { FlagEntry, FlagMap } from "../lib/types";

// Pill color by severity (shared language with the flag editor).
const TIER_CLASS: Record<string, string> = { high: "safety", med: "maintenance", low: "service" };

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
  // A bus's flags, most-serious first, so the worst shows up front.
  const activeFlags = (entry?.flags || [])
    .slice()
    .sort((a, b) => tierRank(flagTier(a)) - tierRank(flagTier(b)));
  const isBus = num.length >= 4 && known;

  function pillText(id: string) {
    if (id === "retorque") return `Retorque · ${retorqueTiresDisplay(entry?.retorqueTires)}`;
    if (id === "hold") return (entry?.holdReason || "").trim() ? `Hold · ${entry?.holdReason}` : "Hold";
    if (id === "inspection") {
      const o = (entry?.inspOption || "").trim() || inspMilesDisplay(entry);
      return o ? `Inspection · ${o}` : "Inspection";
    }
    return flagName(id);
  }

  // Quiet secondary actions only when they apply to this spot.
  const showClear = !!value && value !== "X";
  const showLock = !!onToggleLock && !!value && value !== "X" && num === value;
  const hasSecondary = showClear || blockable || showLock;

  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal"
      label="Bus number"
      onOpenFocus={() => inputRef.current?.focus({ preventScroll: true })}
    >
      <div className="modal__head">
        <div>
          <div className="modal__title">Bus number</div>
          {subLabel && <div className="modal__sub">{subLabel}</div>}
        </div>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <input
        ref={inputRef}
        className="modal__input"
        value={num}
        inputMode="numeric"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = sanitizeBus(e.target.value);
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
        <div className="modal__warn">
          Bus {busLabel(num)} is currently at <strong>{dup}</strong>.
          <div className="modal__warnactions">
            <button className="btn btn--primary btn--mini" onClick={moveHere}>
              Move it here
            </button>
            <button className="btn btn--mini" onClick={() => setDup("")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {showWarning && !dup && (
        <div className="modal__warn">
          {num} isn&apos;t on the bus list — double-check it. You can still save it.
        </div>
      )}

      {isBus && (
        <>
          <div className="cellstatus">
            ✓ On the list{typeLabels ? ` · ${typeLabels}` : ""}
          </div>
          {onEditFlags && (
            <button className="cellflags" onClick={() => onEditFlags(num)} title="Edit this bus's flags">
              {activeFlags.length > 0 || note ? (
                <span className="cellflags__pills">
                  {activeFlags.map((id) => (
                    <span key={id} className={`fpill fpill--${TIER_CLASS[flagTier(id)]}`}>
                      {pillText(id)}
                    </span>
                  ))}
                  {note && <span className="fpill">“{note}”</span>}
                </span>
              ) : (
                <span className="cellflags__add">
                  <Flag size={14} /> Add flags
                </span>
              )}
              <ChevronRight size={18} className="cellflags__chev" />
            </button>
          )}
        </>
      )}

      {/* Send the bus that's parked in this cell straight to a lot — no dragging. */}
      {onSendToLot && !!sendTargets?.length && value && value !== "X" && num === value && (
        <div className="sendrow">
          <span className="sendrow__lbl">Send to</span>
          {sendTargets.map((t) => (
            <button key={t.key} className="btn btn--mini" onClick={() => onSendToLot(num, t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <button className="btn btn--primary btn--block modal__save" onClick={() => trySave()}>
        Save
      </button>

      {hasSecondary && (
        <div className="cellact-row">
          {showClear && (
            <button className="cellact cellact--danger" onClick={() => onSave("")}>
              <Eraser size={16} /> Clear
            </button>
          )}
          {blockable && (
            <button
              className="cellact"
              onClick={() => onSave(value === "X" ? "" : "X")}
              title={value === "X" ? "Reopen this spot" : "Mark this spot unusable (prints an X, like ROW 10's)"}
            >
              <Ban size={16} /> {value === "X" ? "Unblock" : "Block"}
            </button>
          )}
          {showLock && (
            <button
              className="cellact"
              onClick={onToggleLock}
              title={locked ? "Unlock — Clear Grid will remove it again" : "Keep this bus in place through Clear Grid"}
            >
              {locked ? <Unlock size={16} /> : <Lock size={16} />} {locked ? "Unlock" : "Lock"}
            </button>
          )}
        </div>
      )}
    </Overlay>
  );
}

// high -> 0, med -> 1, low -> 2 (for sorting flags most-serious first).
function tierRank(tier: string): number {
  return tier === "high" ? 0 : tier === "med" ? 1 : 2;
}
