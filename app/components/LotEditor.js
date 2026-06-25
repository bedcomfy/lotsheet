"use client";

import { useEffect, useRef, useState } from "react";
import { flagsFullDisplay } from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";

export default function LotEditor({ title, list, flags = {}, locate, onAdd, onRemove, onMove, onClose }) {
  const { isKnown: isKnownBus, label: busLabel } = useBusMaster();
  const [val, setVal] = useState("");
  const [dup, setDup] = useState(""); // where this bus already sits, if anywhere
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  function add(bus) {
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
    ref.current?.focus();
  }

  // Same check as the grid: warn about a number that isn't on the roster.
  const known = isKnownBus(val);
  const showWarn = val.length >= 4 && !known;

  function onChange(raw) {
    const v = sanitizeBus(raw);
    setDup("");
    // Autocomplete: as soon as a valid bus is typed, add it (like the grid /
    // Fill Rows auto-advance). Unknown numbers still add via the Add button.
    if (isKnownBus(v)) add(v);
    else setVal(v);
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
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn btn--primary" onClick={() => add()}>
            Add
          </button>
        </div>
        {dup && (
          <div className="modal__warn">
            Bus {busLabel(val)} is already on the sheet at <strong>{dup}</strong>. Remove it
            there first — a bus can only be in one place.
          </div>
        )}
        {showWarn && !dup && (
          <div className="modal__warn">
            {val} isn&apos;t on the bus list — double-check it. Press Add to use it anyway.
          </div>
        )}

        <div className="lotlist">
          {list.length === 0 && (
            <div className="lotlist__empty">No buses yet — type a number and press Add.</div>
          )}
          {list.map((bus, i) => {
            const fdisp = flagsFullDisplay(flags[bus]);
            return (
            <div className="lotitem" key={`${bus}-${i}`}>
              <span className="lotitem__idx">{i + 1}.</span>
              <span className="lotitem__bus">{busLabel(bus)}</span>
              <TypeCodes num={bus} />
              {fdisp && <span className="lotitem__flag">{fdisp}</span>}
              <div className="toolbar__spacer" />
              <button
                className="lotitem__move"
                onClick={() => onMove(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                className="lotitem__move"
                onClick={() => onMove(i, 1)}
                disabled={i === list.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button className="busrow__clear" onClick={() => onRemove(i)}>
                Remove
              </button>
            </div>
            );
          })}
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
