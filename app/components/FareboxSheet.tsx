"use client";

import { useEffect, useRef, useState } from "react";
import { FUEL_COLUMNS } from "../lib/fuelBuses";
import { openSheetPdf } from "../lib/pdf";
import { History, Eraser, FileDown, FileText } from "lucide-react";
import { useBusMaster } from "./BusMasterProvider";
import ToolMenu from "./ToolMenu";
import SheetHistory from "./SheetHistory";
import DatePickerField from "./DatePickerField";
import { chicagoDateShort } from "../lib/chicagoTime";

// Daily Fare Box Checks — one row per service-lane bus: the servicer and a
// note explaining why the farebox would not probe. The sheet is split into
// real letter-size pages
// (32 buses each) exactly like the paper concept, with the title + column
// headers on every page. Printing produces one N-marked set and one S-marked
// set (the two lane clipboards); a blank print is a single plain set.

interface FareboxEntry {
  yn: "" | "y" | "n";
  serv: string;
  note: string;
  noPower: boolean;
  wontProbe: boolean;
}
interface FareboxData {
  date: string;
  entries: Record<string, FareboxEntry>;
}

const EMPTY_ENTRY: FareboxEntry = { yn: "", serv: "", note: "", noPower: false, wontProbe: false };
const ROWS_PER_PAGE = 32; // four pages with taller rows and minimal write-in padding

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
  return {
    yn,
    serv: raw.serv || "",
    note: raw.note || "",
    noPower: raw.noPower === true,
    wontProbe: raw.wontProbe === true,
  };
}

interface FareboxSheetProps {
  // Render the #print-ready marker (a composite print page renders its own).
  marker?: boolean;
  embedded?: boolean;
  previewLaneCopies?: boolean;
  dateOverride?: string;
  onReady?: (ready: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

export default function FareboxSheet({
  marker = true,
  embedded = false,
  previewLaneCopies = false,
  dateOverride = "",
  onReady,
  onRegisterFlush,
}: FareboxSheetProps) {
  const [data, setData] = useState<FareboxData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [blankMode, setBlankMode] = useState(false);
  const [laneCopies, setLaneCopies] = useState(false); // print an N set + an S set
  const [prevOpen, setPrevOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataRef = useRef<FareboxData>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!onRegisterFlush) return;
    const flush = () =>
      fetch("/api/state/farebox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: dataRef.current }),
      });
    onRegisterFlush(flush);
    return () => onRegisterFlush(null);
  }, [onRegisterFlush]);

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

  useEffect(() => {
    if (!loaded || printMode || !dateOverride) return;
    setData((current) => (current.date === dateOverride ? current : { ...current, date: dateOverride }));
  }, [dateOverride, loaded, printMode]);

  function setEntry(bus: string, patch: Partial<FareboxEntry>) {
    setData((d) => {
      const next = { ...(d.entries[bus] || EMPTY_ENTRY), ...patch };
      const entries = { ...d.entries };
      if (!next.yn && !next.serv && !next.note && !next.noPower && !next.wontProbe) delete entries[bus];
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
  function printBlank() {
    openSheetPdf({ path: "/farebox", maint: false, params: { blank: 1 } });
  }

  const { laneBuses, ready: busReady } = useBusMaster();
  const buses = laneOrder(laneBuses());
  const requestedDate = dateOverride || param("dateOverride") || "";
  const displayDate = blankMode ? "" : requestedDate || (data.date && data.date.trim() ? data.date : chicagoDateShort());

  useEffect(() => {
    onReady?.(loaded && busReady);
  }, [busReady, loaded, onReady]);

  // Letter-size pages, exactly like the paper concept. Every page is a full
  // 32 rows — the last page is padded with EMPTY slots (same size as every
  // other row) for writing in buses serviced more than once in a night.
  const pages: (string | null)[][] = [];
  for (let i = 0; i < buses.length; i += ROWS_PER_PAGE) pages.push(buses.slice(i, i + ROWS_PER_PAGE));
  if (pages.length) {
    const last = pages[pages.length - 1];
    while (last.length < ROWS_PER_PAGE) last.push(null);
  }
  // Which sets to render: normally one plain set on screen; the PDF prints an
  // N-circled and an S-circled set; a blank print is a single plain set.
  const lanes: ("n" | "s" | null)[] =
    !blankMode && ((printMode && laneCopies) || previewLaneCopies) ? ["n", "s"] : [null];

  function reasonControl(
    bus: string,
    field: "noPower" | "wontProbe",
    label: string,
    forceBlank = false,
  ) {
    const checked = !forceBlank && (data.entries[bus] || EMPTY_ENTRY)[field];
    const content = (
      <>
        <span className="fbx__reasonbox" aria-hidden="true">{checked ? "X" : ""}</span>
        <span>{label}</span>
      </>
    );
    if (blankMode || forceBlank) return <span className="fbx__reason">{content}</span>;
    return (
      <button
        type="button"
        className="fbx__reason"
        aria-pressed={checked}
        onClick={() => setEntry(bus, { [field]: !checked })}
      >
        {content}
      </button>
    );
  }

  function notesCell(bus: string, forceBlank = false) {
    const entry = forceBlank ? EMPTY_ENTRY : data.entries[bus] || EMPTY_ENTRY;
    return (
      <div className="fbx__notes">
        {reasonControl(bus, "noPower", "No Power", forceBlank)}
        {reasonControl(bus, "wontProbe", "Won't Probe", forceBlank)}
        <span className="fbx__other">
          <span>Other:</span>
          {blankMode || forceBlank ? (
            <span className="fbx__otherline" />
          ) : (
            <input
              className="fbx__in"
              value={entry.note}
              aria-label={`Other farebox note for bus ${bus}`}
              onChange={(ev) => setEntry(bus, { note: ev.target.value })}
            />
          )}
        </span>
      </div>
    );
  }

  // An empty write-in slot with the same geometry as every populated row.
  function emptyRow(key: number) {
    return (
      <tr key={`empty-${key}`}>
        <td className="fbx__bus" />
        <td />
        <td>{notesCell("", true)}</td>
      </tr>
    );
  }

  function paper(lane: "n" | "s" | null, pageBuses: (string | null)[], pageNo: number) {
    return (
      <div className="sheet fbx-sheet" key={`${lane ?? "x"}-${pageNo}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sheet-brand-logo" src="/logo.png" alt="Pace" />
        <table className="fbx">
          <colgroup>
            <col className="fbx__col--bus" />
            <col className="fbx__col--serv" />
            <col className="fbx__col--note" />
          </colgroup>
          <thead>
            <tr className="fbx__hdr">
              <td colSpan={3}>
                <div className="fbx__hdrrow">
                  <span className="fbx__name">DAILY FARE BOX CHECKS</span>
                  <span className="fbx__field">
                    DATE: <span className="fbx__dateval">{displayDate}</span>
                  </span>
                  <span className="fbx__ns">
                    <span className={lane === "n" ? "fbx__lane fbx__lane--circled" : "fbx__lane"}>N</span>
                    <span className="fbx__ynsep">/</span>
                    <span className={lane === "s" ? "fbx__lane fbx__lane--circled" : "fbx__lane"}>S</span>
                  </span>
                </div>
              </td>
            </tr>
            <tr className="fbx__colhdr">
              <td>BUS</td>
              <td>SERV</td>
              <td>IF FAREBOX WON&apos;T PROBE, WHY?</td>
            </tr>
          </thead>
          <tbody>
            {pageBuses.map((bus, i) => {
              if (bus === null) return emptyRow(i);
              const e = data.entries[bus] || EMPTY_ENTRY;
              return (
                <tr key={bus}>
                  <td className="fbx__bus">{bus}</td>
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
                  <td>{notesCell(bus)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="fbx__footer">
          {pageNo === pages.length - 1 ? (
            <span className="fbx__footer-total">Total: {buses.length}</span>
          ) : null}
          <span className="fbx__footer-page">Page {pageNo + 1} of {pages.length}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!embedded && <div className="toolbar no-print">
        <div className="toolbar__title">Farebox Sheet</div>
        <DatePickerField
          className="toolbar__date"
          value={data.date || displayDate}
          onValueChange={(value) => setData((d) => ({ ...d, date: value }))}
          shortYear
          ariaLabel="Farebox sheet date"
        />
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
        <button className="btn" onClick={printBlank} title="Print a blank Farebox form">
          <FileText size={16} /> Print Blank
        </button>
        <button className="btn btn--primary" onClick={printPdf} title="Prints an N-circled set and an S-circled set">
          <FileDown size={16} /> Print PDF
        </button>
      </div>}

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
