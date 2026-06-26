"use client";

import { useEffect, useRef, useState } from "react";
import { openSheetPdf } from "../lib/pdf";
import SheetSettings from "./SheetSettings";
import SheetHistory from "./SheetHistory";

const STORAGE_KEY = "turnover";
const FONT_DEFAULT = 13;
const FONT_MIN = 8;
const FONT_MAX = 16;

// Rows that carry the right-hand sections, so the left (North Lot) table and the
// right (East Lot / lanes / call-offs) stay aligned in one grid.
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
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [printMode, setPrintMode] = useState(false);
  const [fontPx, setFontPx] = useState(FONT_DEFAULT);
  const [prevOpen, setPrevOpen] = useState(false);
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
    if (!window.confirm("Clear this whole sheet? The current one is saved to Prev Sheets first.")) return;
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

  // A fill-in cell.
  const C = (key, props = {}) => (
    <input
      className="turnt__in"
      value={data.cells[key] || ""}
      onChange={(e) => setCell(key, e.target.value)}
      {...props}
    />
  );

  // One body row of the split section (left North Lot + right section).
  function bodyRow(r) {
    // Left columns A,B,C-D
    let left;
    if (r === 19) {
      left = (
        <>
          <td className="turnt__sub" />
          <td className="turnt__lbl">FENCE</td>
          <td colSpan={2}>{C("fence")}</td>
        </>
      );
    } else if (r === 24) {
      left = (
        <>
          <td className="turnt__sub" />
          <td className="turnt__lbl">R/C</td>
          <td colSpan={2}>{C("rc")}</td>
        </>
      );
    } else if (r === 32) {
      left = (
        <>
          <td className="turnt__sub" />
          <td className="turnt__lbl">APRON</td>
          <td colSpan={2}>{C("apron")}</td>
        </>
      );
    } else {
      left = (
        <>
          <td>{C(`nl-mech-${r}`, { className: "turnt__in turnt__in--c" })}</td>
          <td>{C(`nl-veh-${r}`, { className: "turnt__in turnt__in--c" })}</td>
          <td colSpan={2}>{C(`nl-reason-${r}`)}</td>
        </>
      );
    }

    // Right columns E,F,G-I (East Lot 6–29, lanes 30–36, call-offs 37–41)
    let right;
    if (r <= 29) {
      right = (
        <>
          <td>{C(`el-mech-${r}`, { className: "turnt__in turnt__in--c" })}</td>
          <td>{C(`el-veh-${r}`, { className: "turnt__in turnt__in--c" })}</td>
          <td colSpan={3}>{C(`el-reason-${r}`)}</td>
        </>
      );
    } else if (r === 30) {
      right = (
        <>
          <td className="turnt__sub" />
          <td className="turnt__lbl" colSpan={2}>NORTH LANE</td>
          <td className="turnt__lbl" colSpan={2}>SOUTH LANE</td>
        </>
      );
    } else if (r <= 36) {
      right = (
        <>
          <td className="turnt__sub" />
          <td colSpan={2}>{C(`nlane-${r}`)}</td>
          <td colSpan={2}>{C(`slane-${r}`)}</td>
        </>
      );
    } else if (r === 37) {
      right = (
        <>
          <td className="turnt__sub" />
          <td className="turnt__lbl" colSpan={4}>EMPLOYEE CALLOFFS</td>
        </>
      );
    } else {
      right = (
        <>
          <td className="turnt__sub" />
          <td colSpan={4}>{C(`calloff-${r}`)}</td>
        </>
      );
    }

    return (
      <tr key={r}>
        {left}
        {right}
      </tr>
    );
  }

  return (
    <div className="app">
      {/* Turnover prints on LEGAL paper (8.5 x 14), unlike the letter sheets. */}
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
          <table className="turnt">
            <colgroup>
              <col style={{ width: "8.2%" }} />
              <col style={{ width: "8.2%" }} />
              <col style={{ width: "28.3%" }} />
              <col style={{ width: "5.4%" }} />
              <col style={{ width: "8.2%" }} />
              <col style={{ width: "8.2%" }} />
              <col style={{ width: "12.7%" }} />
              <col style={{ width: "12.7%" }} />
              <col style={{ width: "8.1%" }} />
            </colgroup>
            <tbody>
              {/* Title */}
              <tr className="turnt__toprow">
                <td colSpan={5} className="turnt__brand">SHIFT TURNOVER</td>
                <td colSpan={4} className="turnt__shiftpick">
                  {SHIFTS.map(([id, label], i) => (
                    <span key={id}>
                      {i > 0 && <span className="turnt__shiftsep">|</span>}
                      <button
                        type="button"
                        className={`turnt__shiftopt ${data.shift === id ? "is-on" : ""}`}
                        onClick={() => setShift(id)}
                      >
                        {label}
                      </button>
                    </span>
                  ))}
                </td>
              </tr>
              {/* Foreman + date */}
              <tr>
                <td colSpan={4} className="turnt__field">
                  <div className="turnt__line">
                    <span className="turnt__fieldlbl">FOREMAN / SR:</span>
                    {C("foreman", { className: "turnt__in turnt__in--fill" })}
                  </div>
                </td>
                <td colSpan={5} className="turnt__field">
                  <div className="turnt__line">
                    <span className="turnt__fieldlbl">DATE:</span>
                    {C("date", { className: "turnt__in turnt__in--fill" })}
                  </div>
                </td>
              </tr>
              {/* Section headers */}
              <tr className="turnt__head">
                <td>MECH.</td>
                <td>VEH #</td>
                <td colSpan={2}>NORTH LOT - REASON</td>
                <td>MECH.</td>
                <td>VEH #</td>
                <td colSpan={3}>EAST LOT - REASON</td>
              </tr>
              {/* Split body (left North Lot / right East Lot, lanes, call-offs) */}
              {Array.from({ length: 36 }, (_, i) => bodyRow(i + 6))}
              {/* Full-width BAY table */}
              <tr className="turnt__head">
                <td className="turnt__sub" />
                <td>BAY</td>
                <td colSpan={3}>1ST HALF</td>
                <td colSpan={4}>2ND HALF</td>
              </tr>
              {Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                return (
                  <tr key={`bay-${n}`}>
                    <td className="turnt__sub" />
                    <td>{C(`bay-${n}`, { className: "turnt__in turnt__in--c" })}</td>
                    <td colSpan={3} className="turnt__bay">
                      <div className="turnt__line">
                        <span className="turnt__bayno">{n})</span>
                        {C(`bay1h-${n}`, { className: "turnt__in turnt__in--fill" })}
                      </div>
                    </td>
                    <td colSpan={4}>{C(`bay2h-${n}`)}</td>
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

      {loaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
