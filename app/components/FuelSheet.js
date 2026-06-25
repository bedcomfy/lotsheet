"use client";

import { useEffect, useRef, useState } from "react";
import { FUEL_COLUMNS } from "../lib/fuelBuses";
import { openSheetPdf } from "../lib/pdf";
import { fuelIndicator, fuelFlagSections } from "../lib/grid";
import { useBusMaster } from "./BusMasterProvider";
import SheetSettings from "./SheetSettings";
import ManagerPanel from "./ManagerPanel";
import SheetHistory from "./SheetHistory";

const FONT_DEFAULT = 14;
const FONT_MIN = 8;
const FONT_MAX = 16;

// The Fuel/DEF list now comes from the master "lane" membership (active + the
// Fuel/DEF toggle), kept in the sheet's familiar order: the original column
// order first, then any newly-added lane buses appended. The grid stays at 4
// columns × 35 rows (the paper layout) unless the lane outgrows it.
const BASE_ORDER = FUEL_COLUMNS.flat().map(String);

function buildLaneColumns(laneList) {
  const laneSet = new Set(laneList);
  const baseSet = new Set(BASE_ORDER);
  const ordered = BASE_ORDER.filter((n) => laneSet.has(n));
  const extras = laneList.filter((n) => !baseSet.has(n));
  const list = [...ordered, ...extras];
  const total = list.length;
  const rows = Math.max(35, Math.ceil((total + 1) / 4));
  const columns = [[], [], [], []];
  for (let i = 0; i < total; i++) columns[Math.floor(i / rows)][i % rows] = list[i];
  for (const c of columns) while (c.length < rows) c.push(null);
  return { columns, rows, total };
}

// Read a query param on the client (the headless PDF loads this page at
// <path>?print=1).
function param(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
const COL_HEADERS = ["BUS", "GALS", "SERV", "BUS", "GALS", "SERV", "BUS", "GALS", "SERV", "BUS", "GALS", "SERV"];

function emptyData() {
  return { date: "", ns: "", start: "", end: "", entries: {} };
}
// The date the sheet is printed, as MM/DD/YY (e.g. 06/25/26).
function printDate() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${String(d.getFullYear()).slice(-2)}`;
}
function sanitizeGals(raw) {
  let s = String(raw).replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s.slice(0, 6);
}

export default function FuelSheet({ title, storageKey, showShiftFields = false }) {
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [printMode, setPrintMode] = useState(false);
  const [fontPx, setFontPx] = useState(FONT_DEFAULT);
  const [busFlags, setBusFlags] = useState({}); // universal flags: { bus: { flags:[...] } }
  const [showFlags, setShowFlags] = useState(false); // print WITH the R/H/I flags?
  const [managerOpen, setManagerOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const saveTimer = useRef(null);
  const prewarmTimer = useRef(null);

  // Keep the local flag map in sync when the editor changes a bus (it also posts
  // to /api/flags itself), so the indicators + summary update immediately.
  function onFlagsUpdated(bus, entry) {
    setBusFlags((prev) => ({ ...prev, [bus]: entry }));
  }

  useEffect(() => {
    const isPrint = param("print") === "1";
    setPrintMode(isPrint);
    // The headless PDF render gets the chosen size + flag state via the query so
    // the printout matches the screen (it has no localStorage of its own).
    if (isPrint) {
      const fz = parseInt(param("fz") || "", 10);
      if (!Number.isNaN(fz)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, fz)));
      setShowFlags(param("maint") === "1");
    } else {
      setShowFlags(localStorage.getItem(`pace:flags:${storageKey}`) === "1");
    }
  }, [storageKey]);

  // The print-with-flags preference (per device, per sheet).
  useEffect(() => {
    if (printMode) return;
    localStorage.setItem(`pace:flags:${storageKey}`, showFlags ? "1" : "0");
  }, [showFlags, storageKey, printMode]);

  // Universal bus flags (shared across the whole site).
  useEffect(() => {
    let alive = true;
    fetch("/api/flags")
      .then((r) => r.json())
      .then((d) => alive && setBusFlags(d.flags || {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Font size preference (per device, per sheet).
  useEffect(() => {
    if (param("print") === "1") return; // print uses the ?fz value, not storage
    const v = parseInt(localStorage.getItem(`pace:font:${storageKey}`) || "", 10);
    if (!Number.isNaN(v)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, v)));
  }, [storageKey]);
  useEffect(() => {
    if (printMode) return;
    localStorage.setItem(`pace:font:${storageKey}`, String(fontPx));
  }, [fontPx, storageKey, printMode]);

  // Quietly (re)build the cached PDF after edits (or a font change) so the next
  // "Print PDF" is instant. Keyed to fz so the prewarm matches what we print.
  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/${storageKey}&fz=${fontPx}&maint=${showFlags ? 1 : 0}&prewarm=1`).catch(() => {});
    }, 1500);
  }
  useEffect(() => {
    if (loaded) schedulePrewarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontPx, showFlags, busFlags]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/state/${storageKey}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d && d.value) setData({ ...emptyData(), ...d.value });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!loaded || printMode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/state/${storageKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: data }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.updatedAt) setSavedAt(new Date(d.updatedAt));
          schedulePrewarm();
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded, storageKey, printMode]);

  function setField(field, value) {
    setData((d) => ({ ...d, [field]: value }));
  }
  function setEntry(bus, key, value) {
    setData((d) => {
      const cur = d.entries[bus] || { gals: "", serv: "" };
      const next = { ...cur, [key]: value };
      const entries = { ...d.entries };
      if (!next.gals && !next.serv) delete entries[bus];
      else entries[bus] = next;
      return { ...d, entries };
    });
  }
  function hasContent(d) {
    return !!(d && (Object.keys(d.entries || {}).length || d.date || d.ns || d.start || d.end));
  }
  // Save a copy into Prev Sheets (server-side) before it's discarded/replaced.
  async function archiveCurrent() {
    if (!hasContent(data)) return;
    await fetch(`/api/state/${storageKey}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: data }),
    }).catch(() => {});
  }
  async function clearAll() {
    if (!window.confirm("Clear this whole sheet? The current one is saved to Prev Sheets first.")) return;
    await archiveCurrent();
    setData(emptyData());
  }
  // The current sheet is archived first (so it isn't lost), the chosen one is
  // loaded, and it leaves the archive since you're continuing it.
  async function importSheet(imported, id) {
    if (!imported) return;
    await archiveCurrent();
    setData({ ...emptyData(), ...imported });
    if (id) {
      fetch(`/api/state/${storageKey}/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    setPrevOpen(false);
  }
  function printPdf() {
    openSheetPdf({
      path: `/${storageKey}`,
      maint: showFlags, // print the R/H/I flags?
      params: { fz: fontPx },
      flush: () =>
        fetch(`/api/state/${storageKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
    });
  }

  const { laneBuses, ready: busReady } = useBusMaster();
  const { columns, rows, total } = buildLaneColumns(laneBuses());

  // The 3 cells for one column-group at a given row (BUS, GALS, SERV).
  function groupCells(g, r) {
    // "Total: N" sits in the last group's last row (matching the original).
    if (g === 3 && r === rows - 1) {
      return [
        <td key={`${g}-b`} className="fuelt__bus" />,
        <td key={`${g}-t`} colSpan={2} className="fuelt__total">
          Total: {total}
        </td>,
      ];
    }
    const bus = columns[g][r];
    if (!bus) return [<td key={`${g}-b`} />, <td key={`${g}-g`} />, <td key={`${g}-s`} />];
    const e = data.entries[bus] || { gals: "", serv: "" };
    const ind = fuelIndicator(busFlags[bus]);
    return [
      <td key={`${g}-b`} className={`fuelt__bus ${ind ? "fuelt__bus--flagged" : ""}`}>
        {ind && (
          <span className="fuelt__ind">
            <span className="fuelt__indl">{ind}</span>
          </span>
        )}
        {bus}
      </td>,
      <td key={`${g}-g`}>
        <input
          className="fuelt__in"
          inputMode="decimal"
          value={e.gals}
          onChange={(ev) => setEntry(bus, "gals", sanitizeGals(ev.target.value))}
        />
      </td>,
      <td key={`${g}-s`}>
        <input
          className="fuelt__in"
          value={e.serv}
          maxLength={4}
          onChange={(ev) => setEntry(bus, "serv", ev.target.value.toUpperCase())}
        />
      </td>,
    ];
  }

  // Second sheet: flagged buses split into sections by flag group. Shown on
  // screen when any exist; printed only when "Print with flags" is on.
  const sections = fuelFlagSections(busFlags);
  const showSummary = (printMode ? showFlags : true) && sections.length > 0;
  // The auto date shows on screen always, but prints only with the flags.
  const showDate = !printMode || showFlags;

  return (
    <div className="app">
      <div className="toolbar no-print">
        <div className="toolbar__title">{title}</div>
        <div className="toolbar__spacer" />
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
        </span>
        <SheetSettings fontPx={fontPx} minPx={FONT_MIN} maxPx={FONT_MAX} onFontPx={setFontPx} />
        <label className="toolbar__check" title="Print the R/H/I flags and the flagged-buses page">
          <input type="checkbox" checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
          Print with flags
        </label>
        <button className="btn" onClick={() => setManagerOpen(true)}>
          Edit Flags
        </button>
        <button className="btn" onClick={() => setPrevOpen(true)}>
          Prev Sheets
        </button>
        <button className="btn" onClick={clearAll}>
          Clear
        </button>
        <button className="btn btn--primary" onClick={printPdf}>
          Print PDF
        </button>
      </div>

      <div className="sheet-scroll" style={{ "--ffz": `${fontPx}px` }}>
        <div className={`sheet fuel-sheet ${showFlags ? "fuel-sheet--flags" : ""}`}>
          <table className="fuelt">
            <tbody>
              {/* Header row (title + date / shift fields) */}
              <tr className="fuelt__hdr">
                {showShiftFields ? (
                  <td colSpan={12}>
                    <div className="fuelt__hdrrow">
                      <span className="fuelt__name">{title}</span>
                      <span className="fuelt__field">
                        DATE: <span className="fuelt__date">{showDate ? printDate() : ""}</span>
                      </span>
                      <span className="fuelt__field fuelt__ns">N / S</span>
                      <span className="fuelt__field">
                        START:{" "}
                        <input className="fuelt__hin fuelt__hin--line" value={data.start} onChange={(e) => setField("start", e.target.value)} />
                      </span>
                      <span className="fuelt__field">
                        END:{" "}
                        <input className="fuelt__hin fuelt__hin--line" value={data.end} onChange={(e) => setField("end", e.target.value)} />
                      </span>
                    </div>
                  </td>
                ) : (
                  <>
                    <td colSpan={6}>
                      <span className="fuelt__name">{title}</span>
                    </td>
                    <td colSpan={6}>
                      DATE: <span className="fuelt__date">{showDate ? printDate() : ""}</span>
                    </td>
                  </>
                )}
              </tr>
              {/* Column headers */}
              <tr className="fuelt__colhdr">
                {COL_HEADERS.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
              {/* Data rows */}
              {Array.from({ length: rows }).map((_, r) => (
                <tr key={r}>{[0, 1, 2, 3].flatMap((g) => groupCells(g, r))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showSummary && (
        <div className="sheet-scroll fuelsum-scroll" style={{ "--ffz": `${fontPx}px` }}>
          <div className="sheet fuel-sheet fuelsum">
            <div className="fuelsum__head">
              <div className="fuelsum__title">SERVICE LANE</div>
              <div className="fuelsum__date">{printDate()}</div>
            </div>
            <div className="fuelsum__sections">
              {sections.map((sec) => (
                <div className="fuelsum__section" key={sec.id}>
                  <div className="fuelsum__seclabel">{sec.label}</div>
                  {sec.rows.map((row) => (
                    <div className="fuelsum__row" key={row.bus}>
                      <span className="fuelsum__bus">{row.bus}</span>
                      <span className="fuelsum__flags">
                        {row.items.map((it) => `${it.label}${it.detail ? ` (${it.detail})` : ""}`).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {managerOpen && (
        <ManagerPanel
          flags={busFlags}
          onClose={() => setManagerOpen(false)}
          onBusFlagsUpdated={onFlagsUpdated}
        />
      )}

      {prevOpen && (
        <SheetHistory
          apiBase={`/api/state/${storageKey}/history`}
          title={`${title} — Prev Sheets`}
          describe={(s) => {
            const n = Object.keys(s?.entries || {}).length;
            return {
              title: s?.date ? `Date: ${s.date}` : "—",
              meta: `${n} bus${n === 1 ? "" : "es"} filled`,
            };
          }}
          onImport={importSheet}
          onClose={() => setPrevOpen(false)}
        />
      )}

      {/* Signals the headless PDF renderer that the sheet + bus list have loaded. */}
      {loaded && busReady && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
