"use client";

import { useEffect, useRef, useState } from "react";
import { openSheetPdf } from "../lib/pdf";
import { flagsFullDisplay } from "../lib/grid";
import { useBusMaster } from "./BusMasterProvider";
import SheetSettings from "./SheetSettings";
import SheetHistory from "./SheetHistory";
import EmployeeInput from "./EmployeeInput";
import ManagerPanel from "./ManagerPanel";
import LotEditor from "./LotEditor";

const STORAGE_KEY = "turnover";
const FONT_DEFAULT = 13;
const FONT_MIN = 8;
const FONT_MAX = 16;

// Fixed slot counts — the form ALWAYS looks the same (1:1 with the paper).
const NORTH_SLOTS = 13;
const FENCE_SLOTS = 4;
const RC_LINES = 7;
const APRON_LINES = 9;
const EAST_SLOTS = 24;
const LANE_LINES = 6;
const CALLOFF_LINES = 4;
const BAY_ROWS = 10;

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
  const { label: busLabel } = useBusMaster();
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [printMode, setPrintMode] = useState(false);
  const [fontPx, setFontPx] = useState(FONT_DEFAULT);
  const [prevOpen, setPrevOpen] = useState(false);

  // Shared with the Lot Sheet: North/East/Fence lots (membership only).
  const [lots, setLots] = useState({ north: [], east: [], fence: [] });
  const [lotsLoaded, setLotsLoaded] = useState(false);
  const lotDirty = useRef(false);
  const lotTimer = useRef(null);
  const [editingLot, setEditingLot] = useState(null); // 'north' | 'east' | 'fence'

  // Universal flags = the "reason" a bus is on a sheet.
  const [flags, setFlags] = useState({});
  const [flagBus, setFlagBus] = useState(null); // bus whose flag menu is open

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

  // Universal flags (shared with every sheet).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/flags")
        .then((r) => r.json())
        .then((d) => alive && setFlags(d.flags || {}))
        .catch(() => {});
    load();
    const iv = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  function onBusFlagsUpdated(bus, entry) {
    setFlags((prev) => {
      const next = { ...prev };
      const empty =
        !entry ||
        ((!entry.flags || !entry.flags.length) &&
          !(entry.note && entry.note.trim()) &&
          !(entry.holdReason && entry.holdReason.trim()) &&
          !(entry.retorqueTires && entry.retorqueTires.length) &&
          entry.inspMiles == null);
      if (empty) delete next[bus];
      else next[bus] = entry;
      return next;
    });
  }

  // Shared lots: load + poll the Lot Sheet (don't clobber unsaved local edits).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sheet")
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d || !d.sheet || lotDirty.current) return;
          const s = d.sheet;
          setLots({
            north: s.lots?.north || [],
            east: s.lots?.east || [],
            fence: s.lots?.fence || [],
          });
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

  function patchLots(nextLots) {
    setLots(nextLots);
    lotDirty.current = true;
    clearTimeout(lotTimer.current);
    lotTimer.current = setTimeout(() => {
      fetch("/api/sheet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: nextLots }),
      })
        .then((r) => r.json())
        .then(() => {
          lotDirty.current = false;
          schedulePrewarm();
        })
        .catch(() => {
          lotDirty.current = false;
        });
    }, 500);
  }
  function addToLot(key, bus) {
    patchLots({ ...lots, [key]: [...(lots[key] || []), bus] });
  }
  function removeFromLot(key, i) {
    // Flags persist — only the lot membership changes.
    patchLots({ ...lots, [key]: (lots[key] || []).filter((_, j) => j !== i) });
  }
  function moveInLot(key, i, dir) {
    const arr = [...(lots[key] || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchLots({ ...lots, [key]: arr });
  }
  function locateLot(bus) {
    for (const k of ["north", "east", "fence"]) {
      if ((lots[k] || []).includes(bus)) return `${k.toUpperCase()} LOT`;
    }
    return "";
  }

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
  }, [fontPx, flags]);

  // Turnover-only data: load + autosave.
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
    if (!window.confirm("Clear this Turnover sheet? The current one is saved to Prev Sheets first. (The shared lots and bus flags are NOT cleared.)")) return;
    await archiveCurrent();
    setData(emptyData());
  }
  async function importSheet(imported, id) {
    if (!imported) return;
    await archiveCurrent();
    setData({ ...emptyData(), ...imported });
    if (id) fetch(`/api/state/${STORAGE_KEY}/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
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

  // Employee autofill cell (turnover-only).
  const E = (key, props = {}) => (
    <EmployeeInput value={data.cells[key] || ""} onChange={(v) => setCell(key, v)} employees={employees} {...props} />
  );
  // Plain free-text cell (turnover-only).
  const C = (key, props = {}) => (
    <input className="turnt__in" value={data.cells[key] || ""} onChange={(e) => setCell(key, e.target.value)} {...props} />
  );

  // One slot of a shared lot: MECH (employee) | VEH# (shared list) | REASON
  // (the bus's flags; click to open the flag menu). Empty slots stay blank.
  function lotSlot(lotKey, i) {
    const bus = (lots[lotKey] || [])[i] || "";
    return (
      <>
        <td className="turnt__c">{bus ? E(`mech-${bus}`, { className: "turnt__in turnt__in--c" }) : null}</td>
        <td className="turnt__c turnt__veh">{bus ? busLabel(bus) : ""}</td>
        <td colSpan={2} className={`turnt__reason ${bus ? "turnt__reason--btn" : ""}`} onClick={bus ? () => setFlagBus(bus) : undefined}>
          {bus ? flagsFullDisplay(flags[bus]) || <span className="turnt__reasonhint">＋ flag</span> : ""}
        </td>
      </>
    );
  }
  // Right-side East Lot slot (REASON spans 3 columns).
  function eastSlot(i) {
    const bus = (lots.east || [])[i] || "";
    return (
      <>
        <td className="turnt__c">{bus ? E(`mech-${bus}`, { className: "turnt__in turnt__in--c" }) : null}</td>
        <td className="turnt__c turnt__veh">{bus ? busLabel(bus) : ""}</td>
        <td colSpan={3} className={`turnt__reason ${bus ? "turnt__reason--btn" : ""}`} onClick={bus ? () => setFlagBus(bus) : undefined}>
          {bus ? flagsFullDisplay(flags[bus]) || <span className="turnt__reasonhint">＋ flag</span> : ""}
        </td>
      </>
    );
  }

  // Build the 36 shared body rows (left North/Fence/R-C/Apron + right East/Lane/Calloff).
  const LEFT = [];
  for (let i = 0; i < NORTH_SLOTS; i++) LEFT.push({ type: "north", i });
  LEFT.push({ type: "fenceHdr" });
  for (let i = 0; i < FENCE_SLOTS; i++) LEFT.push({ type: "fence", i });
  LEFT.push({ type: "rcHdr" });
  for (let i = 0; i < RC_LINES; i++) LEFT.push({ type: "rc", i });
  LEFT.push({ type: "apronHdr" });
  for (let i = 0; i < APRON_LINES; i++) LEFT.push({ type: "apron", i });

  const RIGHT = [];
  for (let i = 0; i < EAST_SLOTS; i++) RIGHT.push({ type: "east", i });
  RIGHT.push({ type: "laneHdr" });
  for (let i = 0; i < LANE_LINES; i++) RIGHT.push({ type: "lane", i });
  RIGHT.push({ type: "callHdr" });
  for (let i = 0; i < CALLOFF_LINES; i++) RIGHT.push({ type: "calloff", i });
  const BODY = Math.max(LEFT.length, RIGHT.length);

  function leftCells(spec) {
    if (!spec) return <td colSpan={4} />;
    if (spec.type === "north") return lotSlot("north", spec.i);
    if (spec.type === "fence") return lotSlot("fence", spec.i);
    if (spec.type === "fenceHdr")
      return (
        <>
          <td />
          <td colSpan={3} className="turnt__seclbl turnt__seclbl--btn" onClick={() => setEditingLot("fence")}>
            FENCE <span className="turnt__edit">✎</span>
          </td>
        </>
      );
    if (spec.type === "rcHdr")
      return (
        <>
          <td />
          <td colSpan={3} className="turnt__seclbl">R/C</td>
        </>
      );
    if (spec.type === "apronHdr")
      return (
        <>
          <td />
          <td colSpan={3} className="turnt__seclbl">APRON</td>
        </>
      );
    if (spec.type === "rc") return <td colSpan={4}>{C(`rc-${spec.i}`)}</td>;
    if (spec.type === "apron") return <td colSpan={4}>{C(`apron-${spec.i}`)}</td>;
    return <td colSpan={4} />;
  }
  function rightCells(spec) {
    if (!spec) return <td colSpan={5} />;
    if (spec.type === "east") return eastSlot(spec.i);
    if (spec.type === "laneHdr")
      return (
        <>
          <td className="turnt__head" colSpan={2}>NORTH LANE</td>
          <td className="turnt__head" colSpan={3}>SOUTH LANE</td>
        </>
      );
    if (spec.type === "lane")
      return (
        <>
          <td colSpan={2}>{C(`nlane-${spec.i}`)}</td>
          <td colSpan={3}>{C(`slane-${spec.i}`)}</td>
        </>
      );
    if (spec.type === "callHdr")
      return <td className="turnt__head" colSpan={5}>EMPLOYEE CALLOFFS</td>;
    if (spec.type === "calloff") return <td colSpan={5}>{E(`calloff-${spec.i}`)}</td>;
    return <td colSpan={5} />;
  }

  return (
    <div className="app">
      <style dangerouslySetInnerHTML={{ __html: "@page { size: legal portrait; margin: 0; }" }} />

      <div className="toolbar no-print">
        <div className="toolbar__title">Turnover Sheet</div>
        <div className="toolbar__spacer" />
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
        </span>
        <SheetSettings fontPx={fontPx} minPx={FONT_MIN} maxPx={FONT_MAX} onFontPx={setFontPx} />
        <button className="btn" onClick={() => setPrevOpen(true)}>Prev Sheets</button>
        <button className="btn" onClick={clearAll}>Clear</button>
        <button className="btn btn--primary" onClick={printPdf}>Print PDF</button>
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
              {/* Title + shift selector */}
              <tr className="turnt__band">
                <td colSpan={4} className="turnt__brand">SHIFT TURNOVER</td>
                <td colSpan={5} className="turnt__shiftpick">
                  {SHIFTS.map(([id, lbl], i) => (
                    <span key={id}>
                      {i > 0 && <span className="turnt__shiftsep">|</span>}
                      <button type="button" className={`turnt__shiftopt ${data.shift === id ? "is-on" : ""}`} onClick={() => setShift(id)}>
                        {lbl}
                      </button>
                    </span>
                  ))}
                </td>
              </tr>
              {/* Foreman + date */}
              <tr className="turnt__band">
                <td colSpan={4} className="turnt__field">
                  <span className="turnt__fieldlbl">FOREMAN / SR:</span>
                  {C("foreman", { className: "turnt__in turnt__in--fill" })}
                </td>
                <td colSpan={5} className="turnt__field">
                  <span className="turnt__fieldlbl">DATE:</span>
                  {C("date", { className: "turnt__in turnt__in--fill" })}
                </td>
              </tr>
              {/* Section headers (click to add/reorder buses) */}
              <tr className="turnt__head">
                <td>MECH.</td>
                <td>VEH #</td>
                <td colSpan={2} className="turnt__head--btn" onClick={() => setEditingLot("north")}>
                  NORTH LOT - REASON <span className="turnt__edit">✎</span>
                </td>
                <td>MECH.</td>
                <td>VEH #</td>
                <td colSpan={3} className="turnt__head--btn" onClick={() => setEditingLot("east")}>
                  EAST LOT - REASON <span className="turnt__edit">✎</span>
                </td>
              </tr>
              {/* Shared body */}
              {Array.from({ length: BODY }, (_, r) => (
                <tr key={r}>
                  {leftCells(LEFT[r])}
                  {rightCells(RIGHT[r])}
                </tr>
              ))}
              {/* Bay table (full width) */}
              <tr className="turnt__head">
                <td />
                <td>BAY</td>
                <td colSpan={3}>1ST HALF</td>
                <td colSpan={4}>2ND HALF</td>
              </tr>
              {Array.from({ length: BAY_ROWS }, (_, i) => {
                const n = i + 1;
                return (
                  <tr key={`bay-${n}`}>
                    <td />
                    <td className="turnt__bayno">{n}</td>
                    <td colSpan={3}>{E(`bay1h-${n}`)}</td>
                    <td colSpan={4}>{E(`bay2h-${n}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingLot && (
        <LotEditor
          title={`${editingLot.toUpperCase()} LOT`}
          list={lots[editingLot] || []}
          flags={flags}
          locate={(bus) => locateLot(bus)}
          onAdd={(bus) => addToLot(editingLot, bus)}
          onRemove={(i) => removeFromLot(editingLot, i)}
          onMove={(i, dir) => moveInLot(editingLot, i, dir)}
          onClose={() => setEditingLot(null)}
        />
      )}

      {flagBus && (
        <ManagerPanel
          flags={flags}
          initialBus={flagBus}
          onClose={() => setFlagBus(null)}
          onBusFlagsUpdated={onBusFlagsUpdated}
        />
      )}

      {prevOpen && (
        <SheetHistory
          apiBase={`/api/state/${STORAGE_KEY}/history`}
          title="Turnover — Prev Sheets"
          describe={(s) => {
            const n = Object.values(s?.cells || {}).filter((v) => v && String(v).trim()).length;
            return { title: s?.cells?.date ? `Date: ${s.cells.date}` : "—", meta: `${n} field${n === 1 ? "" : "s"} filled` };
          }}
          onImport={importSheet}
          onClose={() => setPrevOpen(false)}
        />
      )}

      {loaded && lotsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
