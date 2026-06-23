"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, STATUSES } from "../lib/grid";

// Bus numbers are 4-5 digits and start with 2 or 6. We warn but never block,
// so unusual real-world entries are still possible.
function isValidBus(num) {
  return /^[26]\d{3,4}$/.test(num);
}

export default function CellEditor({ label, subLabel, value, onSave, onClose }) {
  const [num, setNum] = useState(value.num || "");
  const [color, setColor] = useState(value.color || "none");
  const [status, setStatus] = useState(value.status || "none");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    onSave({ num: num.trim(), color, status });
  }

  function clearAll() {
    onSave({ num: "", color: "none", status: "none" });
  }

  const showWarning = num.length > 0 && !isValidBus(num);

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <div className="modal__title">{label}</div>
            {subLabel && <div className="modal__sub">{subLabel}</div>}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="modal__label">Bus number</label>
        <input
          ref={inputRef}
          className="modal__input"
          value={num}
          onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
          inputMode="numeric"
          placeholder="e.g. 2451"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        {showWarning && (
          <div className="modal__warn">
            Heads up: bus numbers are usually 4–5 digits starting with 2 or 6.
            You can still save this.
          </div>
        )}

        <label className="modal__label">Color (screen only — not printed)</label>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`swatch ${color === c.id ? "swatch--on" : ""} ${
                c.id === "none" ? "swatch--none" : ""
              }`}
              style={c.id === "none" ? undefined : { background: c.hex }}
              onClick={() => setColor(c.id)}
              title={c.label}
            >
              {c.id === "none" ? "∅" : ""}
            </button>
          ))}
        </div>

        <label className="modal__label">Status (screen only — not printed)</label>
        <div className="statuses">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip ${status === s.id ? "chip--on" : ""}`}
              onClick={() => setStatus(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={clearAll}>
            Clear
          </button>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
