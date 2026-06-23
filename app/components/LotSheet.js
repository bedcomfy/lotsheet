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
  flagDisplay,
} from "../lib/grid";
import CellEditor from "./CellEditor";
import ManagerPanel from "./ManagerPanel";
import TypeCodes from "./TypeCodes";
import LotEditor from "./LotEditor";
import RowFill from "./RowFill";

const STORAGE_KEY = "lotsheet:current";

// Back-of-sheet ordered lists.
const LOTS = [
  { key: "north", title: "NORTH LOT" },
  { key: "east", title: "EAST LOT" },
  { key: "fence", title: "FENCE" },
];

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
    cells: {}, // id -> bus number string
    lots: { north: [], east: [], fence: [] }, // back-of-sheet ordered lists
  };
}

export default function LotSheet() {
  const [sheet, setSheet] = useState(emptySheet);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // { id, subLabel }
  const [savedAt, setSavedAt] = useState(null);
  const [flags, setFlags] = useState({}); // bus number -> flagId
  const [managerOpen, setManagerOpen] = useState(false);
  const [showMaint, setShowMaint] = useState(false); // print maintenance info?
  const [fontDelta, setFontDelta] = useState(0); // size relative to Standard (px)
  const [editingLot, setEditingLot] = useState(null); // which back-of-sheet lot
  const [fillOpen, setFillOpen] = useState(false); // mobile Fill Rows mode
  const saveTimer = useRef(null);

  // "Standard" already runs +2px bigger than the base; the slider is ±4 of that.
  const FONT_BASE = 2;

  // Load + persist the text-size preference (per device).
  useEffect(() => {
    const v = parseInt(localStorage.getItem("lotsheet:fontDelta") || "0", 10);
    if (!Number.isNaN(v)) setFontDelta(Math.max(-4, Math.min(4, v)));
  }, []);
  useEffect(() => {
    localStorage.setItem("lotsheet:fontDelta", String(fontDelta));
  }, [fontDelta]);
  function changeFont(d) {
    setFontDelta((f) => Math.max(-4, Math.min(4, f + d)));
  }

  // Load in-progress sheet from this device.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSheet(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  // Load shared bus flags.
  useEffect(() => {
    fetch("/api/flags")
      .then((r) => r.json())
      .then((d) => setFlags(d.flags || {}))
      .catch(() => {});
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

  function getNum(id) {
    const v = sheet.cells[id];
    if (!v) return "";
    // Tolerate the old {num,color,status} shape from earlier saved sheets.
    return typeof v === "string" ? v : v.num || "";
  }

  function saveNum(id, num) {
    setSheet((s) => {
      const cells = { ...s.cells };
      if (num) cells[id] = num;
      else delete cells[id];
      return { ...s, cells };
    });
  }

  function flagFor(num) {
    return (num && flags[num]) || { flags: [], note: "" };
  }

  function onBusFlagsUpdated(bus, entry) {
    setFlags((prev) => {
      const next = { ...prev };
      const empty =
        !entry ||
        ((!entry.flags || !entry.flags.length) && !(entry.note && entry.note.trim()));
      if (empty) delete next[bus];
      else next[bus] = entry;
      return next;
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

  function openCell(id, subLabel) {
    setEditing({ id, subLabel });
  }

  // ---- back-of-sheet lot lists ----
  function lotList(key) {
    return (sheet.lots && sheet.lots[key]) || [];
  }
  function addToLot(key, bus) {
    setSheet((s) => {
      const lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      return { ...s, lots: { ...lots, [key]: [...(lots[key] || []), bus] } };
    });
  }
  function removeFromLot(key, index) {
    setSheet((s) => {
      const lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      return { ...s, lots: { ...lots, [key]: lots[key].filter((_, i) => i !== index) } };
    });
  }
  function moveInLot(key, index, dir) {
    setSheet((s) => {
      const lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = [...(lots[key] || [])];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...s, lots: { ...lots, [key]: arr } };
    });
  }

  // ---- cell renderer ----
  function Cell({ id, slotLabel }) {
    const num = getNum(id);
    const disp = num ? flagDisplay(flagFor(num)) : "";
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
        className={`cell ${num ? "cell--filled" : ""}`}
        onClick={() => openCell(id, slotLabel != null ? `Slot ${slotLabel}` : "ROW 11")}
      >
        {slotLabel != null && <span className="cell__slot">{slotLabel}</span>}
        {num && <TypeCodes num={num} className="cell__types" />}
        <span className="cell__num">{num}</span>
        {disp && <span className="cell__flag">{disp}</span>}
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
        <button className="btn btn--primary" onClick={() => setFillOpen(true)}>
          Fill Rows
        </button>
        <button className="btn" onClick={() => setManagerOpen(true)}>
          Manager
        </button>
        <button className="btn" onClick={newSheet}>
          New
        </button>
        <div className="toolbar__font" title="Text size">
          <button className="btn btn--mini" onClick={() => changeFont(-1)} disabled={fontDelta <= -4} aria-label="Smaller text">
            A−
          </button>
          <span className="toolbar__fontlabel">
            {fontDelta === 0 ? "Standard" : fontDelta > 0 ? `+${fontDelta}` : `${fontDelta}`}
          </span>
          <button className="btn btn--mini" onClick={() => changeFont(1)} disabled={fontDelta >= 4} aria-label="Bigger text">
            A+
          </button>
        </div>
        <label className="toolbar__check" title="Include the bus type codes and maintenance flags on the printout">
          <input
            type="checkbox"
            checked={showMaint}
            onChange={(e) => setShowMaint(e.target.checked)}
          />
          Maintenance info
        </label>
        <button className="btn btn--primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {/* The printable sheet */}
      <div className="sheet-scroll" style={{ "--fz": `${FONT_BASE + fontDelta}px` }}>
        <div className={`sheet ${showMaint ? "sheet--maint" : ""}`}>
          {/* Header */}
          <div className="head">
            <div className="head__logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Pace" />
            </div>
            <div className="head__box">
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
            {Array.from({ length: COLUMN_COUNT }).map((_, c) => {
              if (c >= FRONT_COLUMNS) return <div key={`f${c}`} className="front front--empty" />;
              const id = frontCellId(c);
              const num = getNum(id);
              const disp = num ? flagDisplay(flagFor(num)) : "";
              return (
                <button
                  key={`f${c}`}
                  type="button"
                  className={`front ${num ? "front--filled" : ""}`}
                  onClick={() => openCell(id, `ROW ${c + 1} — front bus`)}
                >
                  {num && <TypeCodes num={num} className="front__types" />}
                  <span className="cell__num">{num}</span>
                  {disp && <span className="front__flag">{disp}</span>}
                </button>
              );
            })}
          </div>

          {/* Main grid: ROW bar sits directly on top of the cells */}
          <div className="grid">
            {Array.from({ length: COLUMN_COUNT }).map((_, c) => (
              <div key={`h${c}`} className="grid__header">
                ROW {c + 1}
              </div>
            ))}

            {SLOTS.map((band, b) =>
              band.map((slot, c) => {
                if (c === COLUMN_COUNT - 1) {
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

        {/* Back of the sheet — ordered lot lists, printed on page 2 */}
        <div className="back-sheet">
          <div className="back__cols">
            {LOTS.map((lot) => (
              <div className="backlot" key={lot.key}>
                <button className="backlot__head" onClick={() => setEditingLot(lot.key)}>
                  {lot.title}
                  <span className="backlot__count"> ({lotList(lot.key).length})</span>
                  <span className="backlot__edit no-print"> ✎ edit</span>
                </button>
                <ol className="backlot__list">
                  {lotList(lot.key).map((bus, i) => (
                    <li key={i}>
                      <span className="backlot__bus">{bus}</span>
                      <TypeCodes num={bus} className="backlot__type" />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <CellEditor
          subLabel={editing.subLabel}
          value={getNum(editing.id)}
          flags={flags}
          onSave={(num) => {
            saveNum(editing.id, num);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {managerOpen && (
        <ManagerPanel
          flags={flags}
          onBusFlagsUpdated={onBusFlagsUpdated}
          onClose={() => setManagerOpen(false)}
        />
      )}

      {fillOpen && (
        <RowFill getNum={getNum} saveNum={saveNum} onClose={() => setFillOpen(false)} />
      )}

      {editingLot && (
        <LotEditor
          title={LOTS.find((l) => l.key === editingLot)?.title || ""}
          list={lotList(editingLot)}
          onAdd={(bus) => addToLot(editingLot, bus)}
          onRemove={(i) => removeFromLot(editingLot, i)}
          onMove={(i, dir) => moveInLot(editingLot, i, dir)}
          onClose={() => setEditingLot(null)}
        />
      )}
    </div>
  );
}
