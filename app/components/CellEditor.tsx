"use client";

import { useEffect, useRef, useState } from "react";
import { typeInfo, flagLabel, inspMilesDisplay } from "../lib/grid";
import { Flag } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import Overlay from "./Overlay";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import type { FlagEntry, FlagMap } from "../lib/types";

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
  onSave: (v: string) => void;
  onClose: () => void;
}

export default function CellEditor({ subLabel, value, flags, cellId, locate, onRelocate, onEditFlags, sendTargets, onSendToLot, onSave, onClose }: CellEditorProps) {
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
    .join(", ");
  const flagText = (entry?.flags || []).map((f) => flagLabel(f)).join(", ");
  const note = (entry?.note || "").trim();
  const miles = inspMilesDisplay(entry);
  const showReadout = num.length >= 4 && (types.length > 0 || flagText || note || miles);

  return (
    <Overlay onClose={onClose} overlayClassName="modal-backdrop no-print" contentClassName="modal" label="Bus number">
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
        {num.length >= 4 && known && (
          <div className="modal__ok">✓ {busLabel(num)} is on the list</div>
        )}

        {showReadout && (
          <div
            className={`flag-readout ${onEditFlags ? "flag-readout--btn" : ""}`}
            onClick={onEditFlags ? () => onEditFlags(num) : undefined}
            title={onEditFlags ? "Edit this bus's flags" : undefined}
          >
            <TypeCodes num={num} className="flag-readout__codes" />
            <span>
              {typeLabels}
              {typeLabels && (flagText || note) ? " · " : ""}
              {flagText}
              {miles ? `${flagText ? " · " : ""}${miles}` : ""}
              {flagText && note ? ", " : ""}
              {note && <em>“{note}”</em>}
              {(flagText || note || miles) && (
                <span className="flag-readout__note"> (manager)</span>
              )}
            </span>
          </div>
        )}

        {/* Send the bus that's parked in this cell straight to a lot — no dragging. */}
        {onSendToLot && !!sendTargets?.length && value && num === value && (
          <div className="sendrow">
            <span className="sendrow__lbl">Send to</span>
            {sendTargets.map((t) => (
              <button key={t.key} className="btn btn--mini" onClick={() => onSendToLot(num, t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={() => onSave("")}>
            Clear
          </button>
          {onEditFlags && num.length >= 4 && (
            <button className="btn" onClick={() => onEditFlags(num)} title="Edit this bus's flags">
              <Flag size={15} /> Flags
            </button>
          )}
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => trySave()}>
            Save
          </button>
        </div>
    </Overlay>
  );
}
