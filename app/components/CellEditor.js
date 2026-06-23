"use client";

import { useEffect, useRef, useState } from "react";
import { typeInfo, flagLabel } from "../lib/grid";
import { isKnownBus, busTypes } from "../lib/buses";
import TypeCodes from "./TypeCodes";

// Bus numbers must start with 2 or 6 and are at most 5 digits. We block any
// character that would break that rule so it never gets typed into the box.
function sanitizeBus(raw) {
  let digits = String(raw).replace(/\D/g, "");
  if (digits && digits[0] !== "2" && digits[0] !== "6") digits = "";
  return digits.slice(0, 5);
}

export default function CellEditor({ subLabel, value, flags, onSave, onClose }) {
  const [num, setNum] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const known = isKnownBus(num);
  const showWarning = num.length >= 4 && !known;

  const entry = num && flags ? flags[num] || { flags: [], note: "" } : { flags: [], note: "" };
  const types = num ? busTypes(num) : [];
  const typeLabels = types
    .map((t) => typeInfo(t)?.label)
    .filter(Boolean)
    .join(", ");
  const flagText = (entry.flags || []).map((f) => flagLabel(f)).join(", ");
  const note = (entry.note || "").trim();
  const showReadout = num.length >= 4 && (types.length > 0 || flagText || note);

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
          onChange={(e) => setNum(sanitizeBus(e.target.value))}
          inputMode="numeric"
          placeholder="Bus number"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(num.trim());
          }}
        />
        {showWarning && (
          <div className="modal__warn">
            {num} isn&apos;t on the bus list — double-check it. You can still save it.
          </div>
        )}
        {num.length >= 4 && known && (
          <div className="modal__ok">✓ Bus {num} is on the list</div>
        )}

        {showReadout && (
          <div className="flag-readout">
            <TypeCodes num={num} className="flag-readout__codes" />
            <span>
              {typeLabels}
              {typeLabels && (flagText || note) ? " · " : ""}
              {flagText}
              {flagText && note ? ", " : ""}
              {note && <em>“{note}”</em>}
              {(flagText || note) && (
                <span className="flag-readout__note"> (manager)</span>
              )}
            </span>
          </div>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={() => onSave("")}>
            Clear
          </button>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => onSave(num.trim())}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
