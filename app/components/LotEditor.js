"use client";

import { useEffect, useRef, useState } from "react";
import TypeCodes from "./TypeCodes";

function sanitizeBus(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d && d[0] !== "2" && d[0] !== "6") d = "";
  return d.slice(0, 5);
}

export default function LotEditor({ title, list, onAdd, onRemove, onClose }) {
  const [val, setVal] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  function add() {
    const b = sanitizeBus(val);
    if (b.length < 4) return;
    onAdd(b);
    setVal("");
    ref.current?.focus();
  }

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal modal--tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <div className="modal__title">{title}</div>
            <div className="modal__sub">Buses print on the back in the order you add them.</div>
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
            onChange={(e) => setVal(sanitizeBus(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn btn--primary" onClick={add}>
            Add
          </button>
        </div>

        <div className="lotlist">
          {list.length === 0 && (
            <div className="lotlist__empty">No buses yet — type a number and press Add.</div>
          )}
          {list.map((bus, i) => (
            <div className="lotitem" key={`${bus}-${i}`}>
              <span className="lotitem__idx">{i + 1}.</span>
              <span className="lotitem__bus">{bus}</span>
              <TypeCodes num={bus} />
              <div className="toolbar__spacer" />
              <button className="busrow__clear" onClick={() => onRemove(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="modal__actions">
          <div className="toolbar__spacer" />
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
