"use client";

import { useEffect, useRef, useState } from "react";
import { FUEL_COLUMNS } from "../lib/fuelBuses";
import { openSheetPdf } from "../lib/pdf";
import { History, Eraser, FileDown } from "lucide-react";
import { useBusMaster } from "./BusMasterProvider";
import ToolMenu from "./ToolMenu";
import SheetHistory from "./SheetHistory";
import DatePickerField from "./DatePickerField";
import { chicagoDateShort } from "../lib/chicagoTime";

// Daily Fare Box Checks — one row per service-lane bus: Y / N for "probed &
// dumped" (circle it, on screen or with a pen), the servicer, and a note for
// why a box wasn't done. The sheet is split into real letter-size pages
// (~35 buses each) exactly like the paper concept, with the title + column
// headers on every page. Printing produces one N-circled set and one
// S-circled set (the two lane clipboards); a blank print is a single plain set.

interface FareboxEntry {
  yn: "" | "y" | "n";
  serv: string;
  note: string;
}
interface FareboxData {
  date: string;
  entries: Record<string, FareboxEntry>;
}

const EMPTY_ENTRY: FareboxEntry = { yn: "", serv: "", note: "" };
const ROWS_PER_PAGE = 35; // matches the original paper concept (4 pages today)

// Same bus list and familiar order as the Fuel/DEF sheets.
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

// Tolerate the first release's { pd: boolean } entry shape.
function normalizeEntry(raw: any): FareboxEntry {
  if (!raw) return { ...EMPTY_ENTRY };
  const yn: FareboxEntry["yn"] = raw.yn === "y" || raw.yn === "n" ? raw.yn : raw.pd ? "y" : "";
  return { yn, serv: raw.serv || "", note: raw.note || "" };
}

interface FareboxSheetProps {
  // Render the #print-ready marker (a composite print page renders its own).
  marker?: boolean;
}

export default function FareboxSheet({ marker = true }: FareboxSheetProps) {
  const [data, setData] = useState<FareboxData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [blankMode, setBlankMode] = useState(false);
  const [laneCopies, setLaneCopies] = useState(false); // print an N set + an S set
  const [prevOpen, setPrevOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setPrintMode(param("print") === "1");
    setBlankMode(param("blank") === "1");
    setLaneCopies(param("variant") === "ns");
  }, []);

  // Quietly (re)build the cached PDF after edits so "Print PDF" is instant.
  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/farebox&maint=1&variant=ns&prewarm=1`).catch(() => {});
    }, 1500);
  }

  useEffect(() => {
    if (param("blank") === "1") {
      setData(emptyData());
      setLoaded(true);
      return;
    }
    let alive = true;
    fetch(`/api/state/farebox`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d && d.value) {
          const entries: Record<string, FareboxEntry> = {};
          for (const [bus, e] of Object.entries(d.value.entries || {})) entries[bus] = normalizeEntry(e);
          setData({ date: d.value.date || "", entries });
        }
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
      if (!next.yn && !next.serv && !next.note) delete entries[bus];
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
    const entries: Record<string, FareboxEntry> = {};
    for (const [bus, e] of Object.entries(imported.entries || {})) entries[bus] = normalizeEntry(e);
    setData({ date: imported.date || "", entries });
    if (id) {
      fetch(`/api/state/farebox/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    setPrevOpen(false);
  }
  function printPdf() {
    openSheetPdf({
      path: "/farebox",
      maint: true,
      params: { variant: "ns" }, // one N-circled set + one S-circled set
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
  const doneCount = buses.filter((b) => data.entries[b]?.yn === "y").length;
  const displayDate = blankMode ? "" : data.date && data.date.trim() ? data.date : chicagoDateShort();

  // Letter-size pages, exactly like the paper concept. Every page is a full
  // 35 rows — the last page is padded with EMPTY slots (same size as every
  // other row) for writing in buses serviced more than once in a night.
  const pages: (string | null)[][] = [];
  for (let i = 0; i < buses.length; i += ROWS_PER_PAGE) pages.push(buses.slice(i, i + ROWS_PER_PAGE));
  if (pages.length) {
    const last = pages[pages.length - 1];
    while (last.length < ROWS_PER_PAGE) last.push(null);
  }
  // Which sets to render: normally one plain set on screen; the PDF prints an
  // N-circled and an S-circled set; a blank print is a single plain set.
  const lanes: ("n" | "s" | null)[] = printMode && laneCopies && !blankMode ? ["n", "s"] : [null];

  function ynCell(bus: string) {
    const e = data.entries[bus] || EMPTY_ENTRY;
    if (blankMode) return <span className="fbx__yn"><span className="fbx__ynopt">Y</span><span className="fbx__ynsep">/</span><span className="fbx__ynopt">N</span></span>;
    return (
      <span className="fbx__yn">
        <button
          type="button"
          className={`fbx__ynopt ${e.yn === "y" ? "fbx__ynopt--on" : ""}`}
          onClick={() => setEntry(bus, { yn: e.yn === "y" ? "" : "y" })}
          aria-pressed={e.yn === "y"}
          aria-label={`Bus ${bus} probed and dumped: yes`}
        >
          Y
        </button>
        <span className="fbx__ynsep">/</span>
        <button
          type="button"
          className={`fbx__ynopt ${e.yn === "n" ? "fbx__ynopt--on" : ""}`}
          onClick={() => setEntry(bus, { yn: e.yn === "n" ? "" : "n" })}
          aria-pressed={e.yn === "n"}
          aria-label={`Bus ${bus} probed and dumped: no`}
        >
          N
        </button>
      </span>
    );
  }

  // An empty write-in slot: blank bus box, plain Y / N to circle by pen.
  function emptyRow(key: number) {
    return (
      <tr key={`empty-${key}`}>
        <td className="fbx__bus" />
        <td className="fbx__pd">
          <span className="fbx__yn">
            <span className="fbx__ynopt">Y</span>
            <span className="fbx__ynsep">/</span>
            <span className="fbx__ynopt">N</span>
          </span>
        </td>
        <td />
        <td />
      </tr>
    );
  }

  function paper(lane: "n" | "s" | null, pageBuses: (string | null)[], pageNo: number) {
    return (
      <div className="sheet fbx-sheet" key={`${lane ?? "x"}-${pageNo}`}>
        <table className="fbx">
          <colgroup>
            <col className="fbx__col--bus" />
            <col className="fbx__col--pd" />
            <col className="fbx__col--serv" />
            <col className="fbx__col--note" />
          </colgroup>
          <thead>
            <tr className="fbx__hdr">
              <td colSpan={4}>
                <div className="fbx__hdrrow">
                  <span className="fbx__name">DAILY FARE BOX CHECKS</span>
                  <span className="fbx__field">
                    DATE: <span className="fbx__dateval">{displayDate}</span>
                  </span>
                  {!blankMode || lane ? (
                    <span className="fbx__ns">
                      <span className={lane === "n" ? "fbx__lane fbx__lane--circled" : "fbx__lane"}>N</span>
                      <span className="fbx__ynsep">/</span>
                      <span className={lane === "s" ? "fbx__lane fbx__lane--circled" : "fbx__lane"}>S</span>
                    </span>
                  ) : null}
                  <span className="fbx__page">
                    Total: {buses.length} · Page {pageNo + 1} of {pages.length}
                  </span>
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
            {pageBuses.map((bus, i) => {
              if (bus === null) return emptyRow(i);
              const e = data.entries[bus] || EMPTY_ENTRY;
              return (
                <tr key={bus} className={e.yn === "y" ? "fbx__row--done" : ""}>
                  <td className="fbx__bus">{bus}</td>
                  <td className="fbx__pd">{ynCell(bus)}</td>
                  <td>
                    {blankMode ? null : (
                      <input
                        className="fbx__in fbx__in--serv"
                        value={e.serv}
                        maxLength={4}
                        onChange={(ev) => setEntry(bus, { serv: ev.target.value.toUpperCase() })}
                      />
                    )}
                  </td>
                  <td>
                    {blankMode ? null : (
                      <input
                        className="fbx__in"
                        value={e.note}
                        onChange={(ev) => setEntry(bus, { note: ev.target.value })}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

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
        <button className="btn btn--primary" onClick={printPdf} title="Prints an N-circled set and an S-circled set">
          <FileDown size={16} /> Print PDF
        </button>
      </div>

      <div className="sheet-scroll fbx-scroll">
        {lanes.flatMap((lane) => pages.map((pageBuses, i) => paper(lane, pageBuses, i)))}
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
      {marker && loaded && busReady && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
