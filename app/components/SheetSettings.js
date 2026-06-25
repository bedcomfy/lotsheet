"use client";

import { useEffect, useRef, useState } from "react";

// A "Sheet Settings" dropdown shown on every sheet's toolbar. Today it holds the
// font-size control; it's a panel so we can add more per-sheet settings later.
export default function SheetSettings({ fontPx, minPx = 8, maxPx = 16, onFontPx, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="setmenu no-print" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Sheet Settings ▾
      </button>
      {open && (
        <div className="setmenu__panel" role="menu">
          <div className="setmenu__row">
            <span className="setmenu__label">Font size</span>
            <div className="setmenu__stepper">
              <button
                className="btn btn--mini"
                onClick={() => onFontPx(Math.max(minPx, fontPx - 1))}
                disabled={fontPx <= minPx}
                aria-label="Smaller font"
              >
                −
              </button>
              <span className="setmenu__val">{fontPx} px</span>
              <button
                className="btn btn--mini"
                onClick={() => onFontPx(Math.min(maxPx, fontPx + 1))}
                disabled={fontPx >= maxPx}
                aria-label="Bigger font"
              >
                +
              </button>
            </div>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
