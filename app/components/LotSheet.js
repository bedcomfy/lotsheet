"use client";

import { useEffect, useRef, useState } from "react";
import {
  SLOTS,
  FRONT_COLUMNS,
  EAST_LOT_CELLS,
  COLUMN_COUNT,
  numberedCellId,
  frontCellId,
  row11CellId,
  COLORS,
} from "../lib/grid";
import CellEditor from "./CellEditor";

const STORAGE_KEY = "lotsheet:current";

function emptySheet() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return {
    time: `${hh}:${min}`,
    date: `${mm}/${dd}/${yyyy}`,
    offProperty: "",
    inShop: "",
    cells: {}, // id -> { num, color, status }
  };
}

function colorHex(id) {
  const c = COLORS.find((x) => x.id === id);
  return c ? c.hex : "transparent";
}

export default function LotSheet() {
  const [sheet, setSheet] = useState(emptySheet);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // { id, label, subLabel }
  const [savedAt, setSavedAt] = useState(null);
  const saveTimer = useRef(null);

  // Load any in-progress sheet from this device.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSheet(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  // Autosave (debounced) to this device.
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));
        setSavedAt(new Date());
      } catch {}
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [sheet, loaded]);

  function setField(field, value) {
    setSheet((s) => ({ ...s, [field]: value }));
  }

  function getCell(id) {
    return sheet.cells[id] || { num: "", color: "none", status: "none" };
  }

  function saveCell(id, data) {
    setSheet((s) => {
      const cells = { ...s.cells };
      const isEmpty =
        !data.num &&
        (!data.color || data.color === "none") &&
        (!data.status || data.status === "none");
      if (isEmpty) {
        delete cells[id];
      } else {
        cells[id] = data;
      }
      return { ...s, cells };
    });
  }

  function newSheet() {
    if (
      Object.keys(sheet.cells).length > 0 &&
      !window.confirm("Start a new blank sheet? The current one is saved on this device until you overwrite it.")
    ) {
      return;
    }
    setSheet(emptySheet());
  }

  function openCell(id, label, subLabel) {
    setEditing({ id, label, subLabel });
  }

  // ---- cell renderer ----
  function Cell({ id, slotLabel }) {
    const data = getCell(id);
    const blocked = slotLabel === "X";
    if (blocked) {
      return (
        <div className="cell cell--blocked">
          <span className="cell__x">X</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        className={`cell ${data.num ? "cell--filled" : ""}`}
        onClick={() => openCell(id, slotLabel != null ? `Slot ${slotLabel}` : "Bus", null)}
      >
        {slotLabel != null && <span className="cell__slot">{slotLabel}</span>}
        {data.color && data.color !== "none" && (
          <span
            className="cell__dot no-print"
            style={{ background: colorHex(data.color) }}
          />
        )}
        <span className="cell__num">{data.num}</span>
      </button>
    );
  }

  return (
    <div className="app">
      {/* Toolbar — never printed */}
      <div className="toolbar no-print">
        <div className="toolbar__title">Lot Sheet</div>
        <div className="toolbar__spacer" />
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "—"}
        </span>
        <button className="btn" onClick={newSheet}>
          New
        </button>
        <button className="btn btn--primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {/* The printable sheet */}
      <div className="sheet-scroll">
        <div className="sheet">
          {/* Header */}
          <div className="head">
            <div className="head__logo">
              <svg viewBox="0 0 100 100" width="42" height="42" aria-hidden="true">
                {/* pointed tail at lower-left */}
                <path d="M27 57 L15 89 L46 74 Z" fill="#15599f" />
                {/* ring */}
                <circle cx="55" cy="45" r="29" fill="none" stroke="#15599f" strokeWidth="13" />
                {/* center square */}
                <rect x="46" y="36" width="18" height="18" fill="#15599f" />
              </svg>
            </div>
            <div className="head__field head__time">
              <label>TIME:</label>
              <input
                value={sheet.time}
                onChange={(e) => setField("time", e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="head__title">LOT SHEET</div>
            <div className="head__field head__date">
              <label>DATE:</label>
              <input
                value={sheet.date}
                onChange={(e) => setField("date", e.target.value)}
              />
            </div>
          </div>

          {/* Counters */}
          <div className="counters">
            <div className="counter">
              <label># OF VEHICLES OFF PROPERTY:</label>
              <input
                value={sheet.offProperty}
                onChange={(e) => setField("offProperty", e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="counter">
              <label># OF VEHICLES IN SHOP:</label>
              <input
                value={sheet.inShop}
                onChange={(e) => setField("inShop", e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Front-bus row — open whitespace ABOVE the ROW bar, ROW 1..6 only */}
          <div className="frontrow">
            {Array.from({ length: COLUMN_COUNT }).map((_, c) =>
              c < FRONT_COLUMNS ? (
                <button
                  key={`f${c}`}
                  type="button"
                  className={`front ${getCell(frontCellId(c)).num ? "front--filled" : ""}`}
                  onClick={() => openCell(frontCellId(c), `ROW ${c + 1} — front bus`, "Written above the row")}
                >
                  {getCell(frontCellId(c)).color !== "none" && (
                    <span
                      className="cell__dot no-print"
                      style={{ background: colorHex(getCell(frontCellId(c)).color) }}
                    />
                  )}
                  <span className="cell__num">{getCell(frontCellId(c)).num}</span>
                </button>
              ) : (
                <div key={`f${c}`} className="front front--empty" />
              )
            )}
          </div>

          {/* Main grid: ROW bar sits directly on top of the cells */}
          <div className="grid">
            {/* Column headers (ROW 1..11) */}
            {Array.from({ length: COLUMN_COUNT }).map((_, c) => (
              <div key={`h${c}`} className="grid__header">
                ROW {c + 1}
              </div>
            ))}

            {/* Numbered bands */}
            {SLOTS.map((band, b) =>
              band.map((slot, c) => {
                if (c === COLUMN_COUNT - 1) {
                  // ROW 11 — writable, unnumbered
                  return <Cell key={`b${b}c${c}`} id={row11CellId(b)} slotLabel={null} />;
                }
                if (slot === "X") {
                  return <Cell key={`b${b}c${c}`} id={null} slotLabel="X" />;
                }
                return <Cell key={`b${b}c${c}`} id={numberedCellId(slot)} slotLabel={slot} />;
              })
            )}
          </div>

          {/* East Lot — present for the form, not used */}
          <div className="eastlot-label">EAST LOT</div>
          <div className="eastlot">
            {Array.from({ length: EAST_LOT_CELLS }).map((_, i) => (
              <div key={`e${i}`} className="eastlot__cell" />
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <CellEditor
          label={editing.label}
          subLabel={editing.subLabel}
          value={getCell(editing.id)}
          onSave={(data) => {
            saveCell(editing.id, data);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
