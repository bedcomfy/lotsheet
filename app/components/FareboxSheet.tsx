"use client";

import { useEffect, useRef, useState } from "react";
import { FUEL_COLUMNS } from "../lib/fuelBuses";
import { openSheetPdf } from "../lib/pdf";
import { History, Eraser, FileDown, Check } from "lucide-react";
import { useBusMaster } from "./BusMasterProvider";
import ToolMenu from "./ToolMenu";
import SheetHistory from "./SheetHistory";
import DatePickerField from "./DatePickerField";
import { chicagoDateShort } from "../lib/chicagoTime";

// Daily Fare Box Checks — one row per lane bus: was the box probed & dumped
// (one mark; a probed box is always dumped), which servicer did it, and a note
// when it wasn't. Filled on screen like the Fuel sheet, or printed (2 copies —
// north & south lane) and filled by hand on a clipboard.

interface FareboxEntry {
  pd: boolean; // probed & dumped
  serv: string;
  note: string;
}
interface FareboxData {
  date: string;
  entries: Record<string, FareboxEntry>;
}

const EMPTY_ENTRY: FareboxEntry = { pd: false, serv: "", note: "" };

// Same bus list and familiar order as the Fuel/DEF sheets: the paper column
// order first, then any newly-added lane buses appended.
const BASE_ORDER = FUEL_COLUMNS.flat().map(String);
function laneOrder(laneList: string[]): string[] {
  const laneSet = new Set(laneList);
  const baseSet = new Set(BASE_ORDER);
  return [...BASE_ORDER.filter((n) => laneSet.has(n)), ...laneList.filter((n) => !baseSet.has(n))];
}

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function emptyData(): FareboxData {
  return { date: "", entries: {} };
}

export default function FareboxSheet() {
  const [data, setData] = useState<FareboxData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setPrintMode(param("print") === "1");
  }, []);

  // Quietly (re)build the cached PDF after edits so "Print PDF" is instant.
  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/farebox&maint=0&prewarm=1`).catch(() => {});
    }, 1500);
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/state/farebox`)
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
      fetch(`/api/state/farebox`, {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loaded, printMode]);

  function setEntry(bus: string, patch: Partial<FareboxEntry>) {
    setData((d) => {
      const next = { ...(d.entries[bus] || EMPTY_ENTRY), ...patch };
      const entries = { ...d.entries };
      if (!next.pd && !next.serv && !next.note) delete entries[bus];
      else entries[bus] = next;
      return { ...d, entries };
    });
  }
  function hasContent(d: FareboxData | null | undefined): boolean {
    return !!(d && (Object.keys(d.entries || {}).length || d.date));
  }
  async function archiveCurrent() {
    if (!hasContent(data)) return;
    await fetch(`/api/state/farebox/history`, {
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
  async function importSheet(imported: any, id?: string) {
    if (!imported) return;
    await archiveCurrent();
    setData({ ...emptyData(), ...imported });
    if (id) {
      fetch(`/api/state/farebox/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    setPrevOpen(false);
  }
  function printPdf() {
    openSheetPdf({
      path: "/farebox",
      flush: () =>
        fetch(`/api/state/farebox`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
    });
  }

  const { laneBuses, ready: busReady } = useBusMaster();
  const buses = laneOrder(laneBuses());
  const doneCount = buses.filter((b) => data.entries[b]?.pd).length;
  const displayDate = data.date && data.date.trim() ? data.date : chicagoDateShort();

  return (
    <div className="app">
      <div className="toolbar no-print">
        <div className="toolbar__title">Farebox Sheet</div>
        <DatePickerField
          className="toolbar__date"
          value={data.date || displayDate}
          onValueChange={(value) => setData((d) => ({ ...d, date: value }))}
          shortYear
          ariaLabel="Farebox sheet date"
        />
        <span className="fbx__count">{doneCount}/{buses.length} done</span>
        <div className="toolbar__spacer" />
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
        </span>
        <ToolMenu>
          <button className="toolmenu__item" onClick={() => setPrevOpen(true)}>
            <History size={16} /> Prev Sheets
          </button>
          <div className="toolmenu__sep" />
          <button className="toolmenu__item toolmenu__item--danger" onClick={clearAll}>
            <Eraser size={16} /> Clear sheet
          </button>
        </ToolMenu>
        <button className="btn btn--primary" onClick={printPdf} title="Print 2 copies — one per lane (N & S)">
          <FileDown size={16} /> Print PDF
        </button>
      </div>

      <div className="sheet-scroll">
        <div className="sheet fbx-sheet">
          <table className="fbx">
            <colgroup>
              <col className="fbx__col--bus" />
              <col className="fbx__col--pd" />
              <col className="fbx__col--serv" />
              <col className="fbx__col--note" />
            </colgroup>
            {/* thead repeats on every printed page, so each stapled sheet
                carries the title, date, lane, and column labels. */}
            <thead>
              <tr className="fbx__hdr">
                <td colSpan={4}>
                  <div className="fbx__hdrrow">
                    <span className="fbx__name">DAILY FARE BOX CHECKS</span>
                    <span className="fbx__field">
                      DATE: <span className="fbx__dateval">{displayDate}</span>
                    </span>
                    <span className="fbx__field fbx__ns">N / S</span>
                  </div>
                </td>
              </tr>
              <tr className="fbx__colhdr">
                <td>BUS</td>
                <td>PROBED &amp; DUMPED</td>
                <td>SERV</td>
                <td>NOTES (if not probed/dumped, why?)</td>
              </tr>
            </thead>
            <tbody>
              {buses.map((bus) => {
                const e = data.entries[bus] || EMPTY_ENTRY;
                return (
                  <tr key={bus} className={e.pd ? "fbx__row--done" : ""}>
                    <td className="fbx__bus">{bus}</td>
                    <td className="fbx__pd">
                      <button
                        type="button"
                        className={`fbx__check ${e.pd ? "fbx__check--on" : ""}`}
                        onClick={() => setEntry(bus, { pd: !e.pd })}
                        aria-label={`Bus ${bus} probed and dumped`}
                        aria-pressed={e.pd}
                      >
                        {e.pd && <Check size={13} strokeWidth={3.5} />}
                      </button>
                    </td>
                    <td>
                      <input
                        className="fbx__in fbx__in--serv"
                        value={e.serv}
                        maxLength={4}
                        onChange={(ev) => setEntry(bus, { serv: ev.target.value.toUpperCase() })}
                      />
                    </td>
                    <td>
                      <input
                        className="fbx__in"
                        value={e.note}
                        onChange={(ev) => setEntry(bus, { note: ev.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
              <tr className="fbx__totalrow">
                <td colSpan={4}>Total: {buses.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {prevOpen && (
        <SheetHistory
          apiBase="/api/state/farebox/history"
          title="Farebox Sheet — Prev Sheets"
          describe={(s) => {
            const n = Object.keys(s?.entries || {}).length;
            return {
              title: s?.date ? `Date: ${s.date}` : "—",
              meta: `${n} bus${n === 1 ? "" : "es"} marked`,
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
