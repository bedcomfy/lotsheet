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
  inspMilesDisplay,
  flagsFullDisplay,
  groupFlaggedBuses,
  cellLocationLabel,
} from "../lib/grid";
import CellEditor from "./CellEditor";
import ManagerPanel from "./ManagerPanel";
import TypeCodes from "./TypeCodes";
import LotEditor from "./LotEditor";
import RowFill from "./RowFill";
import PrevSheets from "./PrevSheets";

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
  const [prevOpen, setPrevOpen] = useState(false); // Prev Sheets archive
  const saveTimer = useRef(null);
  const lastSyncRef = useRef(null); // JSON of the sheet known to match the server
  const sheetRef = useRef(sheet); // always-current sheet, for the poll loop
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

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

  // Load the shared current sheet from the server. Show the device cache first
  // so the page isn't blank on a slow connection, then sync with the server.
  useEffect(() => {
    let cancelled = false;
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) setSheet(JSON.parse(cached));
    } catch {}
    fetch("/api/sheet")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d && d.sheet) {
          setSheet(d.sheet);
          lastSyncRef.current = JSON.stringify(d.sheet);
        }
        // If the server has no sheet yet, leave lastSyncRef null so the device's
        // current sheet gets pushed up on the first autosave.
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load shared bus flags.
  useEffect(() => {
    fetch("/api/flags")
      .then((r) => r.json())
      .then((d) => setFlags(d.flags || {}))
      .catch(() => {});
  }, []);

  // Autosave (debounced) to the server, so every device sees the same sheet.
  // A local copy is also kept as an offline backup.
  useEffect(() => {
    if (!loaded) return;
    const json = JSON.stringify(sheet);
    if (json === lastSyncRef.current) return; // nothing new to push
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch {}
      fetch("/api/sheet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.ok) {
            lastSyncRef.current = json;
            setSavedAt(new Date());
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [sheet, loaded]);

  // Poll for changes made on other devices. Adopt the server's sheet only when
  // there are no unsaved local edits, so we never clobber in-progress typing.
  useEffect(() => {
    if (!loaded) return;
    const iv = setInterval(() => {
      fetch("/api/sheet")
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.sheet) return;
          const serverJson = JSON.stringify(d.sheet);
          if (serverJson === lastSyncRef.current) return; // no change
          if (JSON.stringify(sheetRef.current) !== lastSyncRef.current) return; // local edits pending
          setSheet(d.sheet);
          lastSyncRef.current = serverJson;
          try {
            localStorage.setItem(STORAGE_KEY, serverJson);
          } catch {}
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
  }, [loaded]);

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

  function sheetHasContent(s) {
    const cells = s && s.cells ? Object.values(s.cells).filter(Boolean).length : 0;
    const lots = s && s.lots
      ? Object.values(s.lots).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0)
      : 0;
    return cells + lots > 0;
  }

  // Save a copy into Prev Sheets (server-side) before it's discarded.
  async function archiveSheet(s) {
    if (!sheetHasContent(s)) return;
    try {
      await fetch("/api/sheet/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet: s }),
      });
    } catch {}
  }

  function gridHasContent(s) {
    return !!(s && s.cells && Object.values(s.cells).filter(Boolean).length > 0);
  }
  function lotsHaveContent(s) {
    return !!(
      s &&
      s.lots &&
      Object.values(s.lots).some((a) => Array.isArray(a) && a.length > 0)
    );
  }

  // "New" resets the daily grid (cells, counters, time/date) but keeps the
  // back-of-sheet lots, which don't change as often.
  async function newSheet() {
    if (
      gridHasContent(sheet) &&
      !window.confirm(
        "Start a new grid for everyone? The current sheet is saved to Prev Sheets first; the grid clears but the back-of-sheet lots stay."
      )
    ) {
      return;
    }
    await archiveSheet(sheet);
    setSheet((s) => ({ ...emptySheet(), lots: s.lots }));
  }

  // Clears just the back-of-sheet lots (North / East / Fence).
  async function clearLots() {
    if (
      lotsHaveContent(sheet) &&
      !window.confirm(
        "Clear the back-of-sheet lots (North / East / Fence) for everyone? The current sheet is saved to Prev Sheets first."
      )
    ) {
      return;
    }
    await archiveSheet(sheet);
    setSheet((s) => ({ ...s, lots: { north: [], east: [], fence: [] } }));
  }

  // Bring a previous sheet back as the current shared sheet. The sheet that's up
  // now is archived first (so it isn't lost), and the imported one leaves the
  // archive since you're continuing it.
  async function importSheet(imported, id) {
    if (!imported) return;
    await archiveSheet(sheet);
    if (id) {
      try {
        await fetch(`/api/sheet/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {}
    }
    setSheet(imported);
    setPrevOpen(false);
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

  // Find where a bus already sits on the sheet — grid cell, front, ROW 11, or a
  // back-of-sheet lot — excluding one cell id (the one being edited). Returns a
  // human location ("Row 9 · #39", "North Lot") or "" if it's not on the sheet.
  // A bus may only appear in one place, so this powers the duplicate guard.
  function locateBus(num, exceptCellId) {
    if (!num) return "";
    for (const [id, v] of Object.entries(sheet.cells || {})) {
      if (id === exceptCellId) continue;
      const n = typeof v === "string" ? v : v && v.num;
      if (n === num) return cellLocationLabel(id);
    }
    const lots = sheet.lots || {};
    for (const lot of LOTS) {
      if ((lots[lot.key] || []).includes(num)) return lot.title;
    }
    return "";
  }

  // ---- cell renderer ----
  function Cell({ id, slotLabel }) {
    const num = getNum(id);
    const entry = num ? flagFor(num) : null;
    const disp = entry ? flagDisplay(entry) : "";
    const miles = entry ? inspMilesDisplay(entry) : "";
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
        {(disp || miles) && (
          <span className="cell__meta">
            {disp && <span className="cell__flag">{disp}</span>}
            {miles && <span className="cell__insp">{miles}</span>}
          </span>
        )}
      </button>
    );
  }

  // Buses with flags, grouped by most-severe flag, for the back-of-sheet summary.
  const flagSummary = groupFlaggedBuses(flags);

  // Where each bus currently sits on the grid (bus number -> "Row 5 · #85").
  const busLocations = {};
  for (const [id, v] of Object.entries(sheet.cells || {})) {
    const n = typeof v === "string" ? v : v && v.num;
    if (!n) continue;
    const loc = cellLocationLabel(id);
    if (loc) (busLocations[n] = busLocations[n] || []).push(loc);
  }

  // "# OF VEHICLES OFF PROPERTY" is auto-counted from the OFF PROPERTY flag.
  const offPropertyCount = Object.values(flags).filter((e) =>
    (e.flags || []).includes("offprop")
  ).length;

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
          New Grid
        </button>
        <button className="btn" onClick={clearLots}>
          Clear Lots
        </button>
        <button className="btn" onClick={() => setPrevOpen(true)}>
          Prev Sheets
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
                className="counter__auto"
                value={offPropertyCount}
                readOnly
                title="Auto-counted from buses flagged OFF PROPERTY in the Manager panel"
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
              const entry = num ? flagFor(num) : null;
              const disp = entry ? flagDisplay(entry) : "";
              const miles = entry ? inspMilesDisplay(entry) : "";
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
                  {miles && <span className="front__flag front__insp">{miles}</span>}
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
                  {lotList(lot.key).map((bus, i) => {
                    const fdisp = flagsFullDisplay(flagFor(bus));
                    return (
                      <li key={i}>
                        <span className="backlot__bus">{bus}</span>
                        <TypeCodes num={bus} className="backlot__type" />
                        {fdisp && <span className="backlot__flag">{fdisp}</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>

          {/* Flag summary — every flagged bus, grouped by most-severe flag,
              numerically sorted, with all of its flags spelled out. */}
          {flagSummary.length > 0 && (
            <div className="flagsum">
              <div className="flagsum__title">BUSES WITH FLAGS</div>
              {flagSummary.map((g) => (
                <div className="flagsum__group" key={g.cat}>
                  <div className="flagsum__cat">{g.label}</div>
                  <ul className="flagsum__list">
                    {g.buses.map((bus) => (
                      <li key={bus}>
                        <span className="flagsum__bus">{bus}</span>
                        <TypeCodes num={bus} className="flagsum__type" />
                        {busLocations[bus] && (
                          <span className="flagsum__loc">{busLocations[bus].join(", ")}</span>
                        )}
                        <span className="flagsum__flags">{flagsFullDisplay(flagFor(bus))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <CellEditor
          subLabel={editing.subLabel}
          value={getNum(editing.id)}
          flags={flags}
          cellId={editing.id}
          locate={locateBus}
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
        <RowFill
          getNum={getNum}
          saveNum={saveNum}
          locate={locateBus}
          onClose={() => setFillOpen(false)}
        />
      )}

      {prevOpen && (
        <PrevSheets onImport={importSheet} onClose={() => setPrevOpen(false)} />
      )}

      {editingLot && (
        <LotEditor
          title={LOTS.find((l) => l.key === editingLot)?.title || ""}
          list={lotList(editingLot)}
          flags={flags}
          locate={locateBus}
          onAdd={(bus) => addToLot(editingLot, bus)}
          onRemove={(i) => removeFromLot(editingLot, i)}
          onMove={(i, dir) => moveInLot(editingLot, i, dir)}
          onClose={() => setEditingLot(null)}
        />
      )}
    </div>
  );
}
