"use client";

import { useEffect, useRef, useState } from "react";
import { openSheetPdf } from "../lib/pdf";
import { sanitizeBus } from "../lib/buses";
import SheetSettings from "./SheetSettings";
import SheetHistory from "./SheetHistory";
import EmployeeInput from "./EmployeeInput";

const STORAGE_KEY = "turnover";
const FONT_DEFAULT = 13;
const FONT_MIN = 8;
const FONT_MAX = 16;

const SHIFTS = [
  ["3rd1st", "3rd to 1st"],
  ["1st2nd", "1st to 2nd"],
  ["2nd3rd", "2nd to 3rd"],
];

function param(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
function emptyData() {
  return { cells: {}, shift: "" };
}

export default function TurnoverSheet() {
  // Turnover-only data (everything except the shared lots): foreman, date, shift,
  // mech (keyed by bus), R/C, apron, lanes, call-offs, bay.
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [printMode, setPrintMode] = useState(false);
  const [fontPx, setFontPx] = useState(FONT_DEFAULT);
  const [prevOpen, setPrevOpen] = useState(false);

  // Shared with the Lot Sheet: North/East/Fence lots + their reasons.
  const [lots, setLots] = useState({ north: [], east: [], fence: [] });
  const [lotReasons, setLotReasons] = useState({});
  const [lotsLoaded, setLotsLoaded] = useState(false);
  const lotDirty = useRef(false);
  const lotTimer = useRef(null);

  const [employees, setEmployees] = useState([]);

  const saveTimer = useRef(null);
  const prewarmTimer = useRef(null);

  useEffect(() => {
    const isPrint = param("print") === "1";
    setPrintMode(isPrint);
    if (isPrint) {
      const fz = parseInt(param("fz") || "", 10);
      if (!Number.isNaN(fz)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, fz)));
    } else {
      const v = parseInt(localStorage.getItem(`pace:font:${STORAGE_KEY}`) || "", 10);
      if (!Number.isNaN(v)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, v)));
    }
  }, []);
  useEffect(() => {
    if (printMode) return;
    localStorage.setItem(`pace:font:${STORAGE_KEY}`, String(fontPx));
  }, [fontPx, printMode]);

  // Employee list (for autofill).
  useEffect(() => {
    let alive = true;
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => alive && setEmployees(d.employees || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Shared lots: load + poll the Lot Sheet (adopt remote unless we have unsaved
  // local lot edits, so we don't clobber typing).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sheet")
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d || !d.sheet) return;
          if (lotDirty.current) return;
          const s = d.sheet;
          setLots({
            north: s.lots?.north || [],
            east: s.lots?.east || [],
            fence: s.lots?.fence || [],
          });
          setLotReasons(s.lotReasons || {});
        })
        .catch(() => {})
        .finally(() => alive && setLotsLoaded(true));
    load();
    const iv = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  function scheduleLotSave(nextLots, nextReasons) {
    lotDirty.current = true;
    clearTimeout(lotTimer.current);
    lotTimer.current = setTimeout(() => {
      fetch("/api/sheet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: nextLots, lotReasons: nextReasons }),
      })
        .then((r) => r.json())
        .then(() => {
          lotDirty.current = false;
          schedulePrewarm();
        })
        .catch(() => {
          lotDirty.current = false;
        });
    }, 600);
  }

  function setLotBusAt(lotKey, i, raw) {
    const b = sanitizeBus(raw);
    const arr = [...(lots[lotKey] || [])];
    const reasons = { ...lotReasons };
    if (!b) {
      if (i < arr.length) {
        const removed = arr[i];
        arr.splice(i, 1);
        delete reasons[removed];
      }
    } else if (i < arr.length) {
      const old = arr[i];
      if (old !== b) {
        arr[i] = b;
        if (old) delete reasons[old];
      }
    } else {
      arr.push(b);
    }
    const nextLots = { ...lots, [lotKey]: arr };
    setLots(nextLots);
    setLotReasons(reasons);
    scheduleLotSave(nextLots, reasons);
  }
  function setReasonFor(bus, val) {
    const reasons = { ...lotReasons };
    if (val && val.trim()) reasons[bus] = val;
    else delete reasons[bus];
    setLotReasons(reasons);
    scheduleLotSave(lots, reasons);
  }

  // Prewarm the PDF after edits so Print is instant.
  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/${STORAGE_KEY}&fz=${fontPx}&prewarm=1`).catch(() => {});
    }, 1500);
  }
  useEffect(() => {
    if (loaded) schedulePrewarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontPx]);

  // Turnover-only state: load + autosave.
  useEffect(() => {
    let alive = true;
    fetch(`/api/state/${STORAGE_KEY}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d && d.value) setData({ ...emptyData(), ...d.value });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded || printMode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/state/${STORAGE_KEY}`, {
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
  }, [data, loaded, printMode]);

  function setCell(key, value) {
    setData((d) => ({ ...d, cells: { ...d.cells, [key]: value } }));
  }
  function setShift(value) {
    setData((d) => ({ ...d, shift: d.shift === value ? "" : value }));
  }
  function hasContent(d) {
    return !!(d && (d.shift || Object.values(d.cells || {}).some((v) => v && String(v).trim())));
  }

  async function archiveCurrent() {
    if (!hasContent(data)) return;
    await fetch(`/api/state/${STORAGE_KEY}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: data }),
    }).catch(() => {});
  }
  async function clearAll() {
    if (!window.confirm("Clear this Turnover sheet? The current one is saved to Prev Sheets first. (The North/East/Fence lots are shared with the Lot Sheet and are NOT cleared.)")) return;
    await archiveCurrent();
    setData(emptyData());
  }
  async function importSheet(imported, id) {
    if (!imported) return;
    await archiveCurrent();
    setData({ ...emptyData(), ...imported });
    if (id) {
      fetch(`/api/state/${STORAGE_KEY}/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    setPrevOpen(false);
  }
  function printPdf() {
    openSheetPdf({
      path: `/${STORAGE_KEY}`,
      params: { fz: fontPx },
      flush: () =>
        fetch(`/api/state/${STORAGE_KEY}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
    });
  }

  // Plain fill-in cell (turnover-only).
  const C = (key, props = {}) => (
    <input
      className="turnt__in"
      value={data.cells[key] || ""}
      onChange={(e) => setCell(key, e.target.value)}
      {...props}
    />
  );
  // Employee autofill cell.
  const E = (key, props = {}) => (
    <EmployeeInput
      value={data.cells[key] || ""}
      onChange={(v) => setCell(key, v)}
      employees={employees}
      {...props}
    />
  );

  // A shared lot table (North / East / Fence): MECH (turnover) | VEH# (shared) |
  // REASON (shared). Shows all buses in the lot plus one empty row to add more.
  function LotTable({ title, lotKey, minRows }) {
    const arr = lots[lotKey] || [];
    const count = Math.max(minRows, arr.length + 1);
    return (
      <table className="turnt turnt--sec">
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "52%" }} />
        </colgroup>
        <tbody>
          <tr className="turnt__head">
            <td>MECH.</td>
            <td>VEH #</td>
            <td>{title} - REASON</td>
          </tr>
          {Array.from({ length: count }, (_, i) => {
            const bus = arr[i] || "";
            return (
              <tr key={i}>
                <td>{bus ? E(`mech-${bus}`, { className: "turnt__in turnt__in--c" }) : null}</td>
                <td>
                  <input
                    className="turnt__in turnt__in--c"
                    inputMode="numeric"
                    value={bus}
                    onChange={(e) => setLotBusAt(lotKey, i, e.target.value)}
                  />
                </td>
                <td>
                  {bus ? (
                    <input
                      className="turnt__in"
                      value={lotReasons[bus] || ""}
                      onChange={(e) => setReasonFor(bus, e.target.value)}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="app">
      {/* Turnover prints on LEGAL paper (8.5 x 14). */}
      <style dangerouslySetInnerHTML={{ __html: "@page { size: legal portrait; margin: 0; }" }} />

      <div className="toolbar no-print">
        <div className="toolbar__title">Turnover Sheet</div>
        <div className="toolbar__spacer" />
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
        </span>
        <SheetSettings fontPx={fontPx} minPx={FONT_MIN} maxPx={FONT_MAX} onFontPx={setFontPx} />
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

      <div className="sheet-scroll" style={{ "--tfz": `${fontPx}px` }}>
        <div className="sheet turn-sheet">
          {/* Header band */}
          <div className="turn-head">
            <div className="turn-head__top">
              <div className="turn-head__brand">SHIFT TURNOVER</div>
              <div className="turn-head__shift">
                {SHIFTS.map(([id, label], i) => (
                  <span key={id}>
                    {i > 0 && <span className="turn-head__sep">|</span>}
                    <button
                      type="button"
                      className={`turnt__shiftopt ${data.shift === id ? "is-on" : ""}`}
                      onClick={() => setShift(id)}
                    >
                      {label}
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="turn-head__fields">
              <label className="turn-head__field">
                <span className="turnt__fieldlbl">FOREMAN / SR:</span>
                {C("foreman", { className: "turnt__in turnt__in--fill" })}
              </label>
              <label className="turn-head__field turn-head__field--date">
                <span className="turnt__fieldlbl">DATE:</span>
                {C("date", { className: "turnt__in turnt__in--fill" })}
              </label>
            </div>
          </div>

          {/* Two columns: left (North Lot, Fence, R/C, Apron), right (East Lot,
              Lanes, Call-offs) */}
          <div className="turn-cols">
            <div className="turn-col">
              <LotTable title="NORTH LOT" lotKey="north" minRows={12} />
              <LotTable title="FENCE" lotKey="fence" minRows={3} />
              <table className="turnt turnt--sec">
                <tbody>
                  <tr className="turnt__head">
                    <td>R/C</td>
                  </tr>
                  <tr>
                    <td>{C("rc")}</td>
                  </tr>
                  <tr className="turnt__head">
                    <td>APRON</td>
                  </tr>
                  <tr>
                    <td>{C("apron")}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="turn-col">
              <LotTable title="EAST LOT" lotKey="east" minRows={12} />
              <table className="turnt turnt--sec">
                <colgroup>
                  <col style={{ width: "50%" }} />
                  <col style={{ width: "50%" }} />
                </colgroup>
                <tbody>
                  <tr className="turnt__head">
                    <td>NORTH LANE</td>
                    <td>SOUTH LANE</td>
                  </tr>
                  {Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td>{C(`nlane-${i}`)}</td>
                      <td>{C(`slane-${i}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="turnt turnt--sec">
                <tbody>
                  <tr className="turnt__head">
                    <td>EMPLOYEE CALLOFFS</td>
                  </tr>
                  {Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td>{E(`calloff-${i}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full-width Bay table */}
          <table className="turnt turnt--sec turn-bay">
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "45%" }} />
              <col style={{ width: "45%" }} />
            </colgroup>
            <tbody>
              <tr className="turnt__head">
                <td>BAY</td>
                <td>1ST HALF</td>
                <td>2ND HALF</td>
              </tr>
              {Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                return (
                  <tr key={n}>
                    <td className="turnt__bayno">{n}</td>
                    <td>{E(`bay1h-${n}`)}</td>
                    <td>{E(`bay2h-${n}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {prevOpen && (
        <SheetHistory
          apiBase={`/api/state/${STORAGE_KEY}/history`}
          title="Turnover — Prev Sheets"
          describe={(s) => {
            const n = Object.values(s?.cells || {}).filter((v) => v && String(v).trim()).length;
            return {
              title: s?.cells?.date ? `Date: ${s.cells.date}` : "—",
              meta: `${n} field${n === 1 ? "" : "s"} filled`,
            };
          }}
          onImport={importSheet}
          onClose={() => setPrevOpen(false)}
        />
      )}

      {loaded && lotsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
