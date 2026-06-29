"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  pinnedFlagText,
} from "../lib/grid";
import { LayoutGrid, Flag, Eraser, ListX, History, Printer, FileDown } from "lucide-react";
import { useBusMaster } from "./BusMasterProvider";
import CellEditor from "./CellEditor";
import ManagerPanel from "./ManagerPanel";
import TypeCodes from "./TypeCodes";
import LotEditor from "./LotEditor";
import RowFill from "./RowFill";
import PrevSheets from "./PrevSheets";
import SheetSettings from "./SheetSettings";
import type { FlagEntry, FlagMap, LotKey, Lots, LotSheet as LotSheetData } from "../lib/types";

const STORAGE_KEY = "lotsheet:current";

// Back-of-sheet ordered lists.
const LOTS: { key: string; title: string }[] = [
  { key: "north", title: "NORTH LOT" },
  { key: "east", title: "EAST LOT" },
  { key: "fence", title: "FENCE" },
];
// Friendly names for EVERY shared lot (incl. the Turnover-managed ones) so the
// duplicate guard can report where a bus already sits.
const LOT_LOCATION_LABELS: Record<string, string> = {
  north: "North Lot", east: "East Lot", fence: "Fence", rc: "R/C", apron: "Apron",
  northlane: "North Lane", southlane: "South Lane", bay: "Bay",
};

type LotStringField = "time" | "date" | "offProperty" | "inShop";

const EMPTY_FLAG: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };

// Tolerate the old { num, color, status } cell shape from earlier saved sheets.
function cellToNum(v: unknown): string {
  if (!v) return "";
  return typeof v === "string" ? v : (v as { num?: string }).num || "";
}

function emptySheet(): LotSheetData {
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

// Read a query param on the very first render (used by the server-side PDF,
// which loads this page at /?print=1&maint=1 with a headless browser).
function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function LotSheet() {
  const { label: busLabel } = useBusMaster();
  const [sheet, setSheet] = useState<LotSheetData>(emptySheet);
  const [loaded, setLoaded] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [editing, setEditing] = useState<{ id: string; subLabel: string } | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [flags, setFlags] = useState<FlagMap>({}); // bus number -> flag entry
  const [managerOpen, setManagerOpen] = useState(false);
  // PDF render mode: the page is opened headless at /?print=1; don't write to
  // the server and expose a readiness marker the PDF generator waits for.
  const [printMode, setPrintMode] = useState(false);
  const [showMaint, setShowMaint] = useState(false); // print maintenance info?

  // Read the print query params on the client (not during SSR/prerender, where
  // window doesn't exist — a lazy initializer would bake in the wrong value).
  useEffect(() => {
    if (param("print") === "1") setPrintMode(true);
    if (param("maint") === "1") setShowMaint(true);
  }, []);
  const [fontDelta, setFontDelta] = useState(0); // size relative to Standard (px)
  const [editingLot, setEditingLot] = useState<string | null>(null); // which back-of-sheet lot
  const [fillOpen, setFillOpen] = useState(false); // mobile Fill Rows mode
  const [prevOpen, setPrevOpen] = useState(false); // Prev Sheets archive
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); // debounce for background PDF pre-build
  const lastSyncRef = useRef<string | null>(null); // JSON of the sheet known to match the server
  const sheetRef = useRef<LotSheetData>(sheet); // always-current sheet, for the poll loop
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
  function changeFont(d: number) {
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
      .catch(() => {})
      .finally(() => setFlagsLoaded(true));
  }, []);

  // Pre-build the PDF when flags or the maintenance toggle change, and once on
  // load (the sheet itself is pre-built after each autosave) so a later
  // "Print PDF" is instant.
  useEffect(() => {
    if (loaded && flagsLoaded) schedulePrewarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags, showMaint, loaded, flagsLoaded]);

  // Autosave (debounced) to the server, so every device sees the same sheet.
  // A local copy is also kept as an offline backup.
  useEffect(() => {
    if (!loaded || printMode) return;
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
            schedulePrewarm(); // pre-build the PDF for the saved sheet
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [sheet, loaded]);

  // Poll for changes made on other devices. Adopt the server's sheet only when
  // there are no unsaved local edits, so we never clobber in-progress typing.
  useEffect(() => {
    if (!loaded || printMode) return;
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

  function setField(field: LotStringField, value: string) {
    setSheet((s) => ({ ...s, [field]: value }));
  }

  function getNum(id: string | null): string {
    if (!id) return "";
    return cellToNum(sheet.cells[id]);
  }

  function saveNum(id: string, num: string) {
    setSheet((s) => {
      const cells = { ...s.cells };
      if (num) cells[id] = num;
      else delete cells[id];
      return { ...s, cells };
    });
  }

  function flagFor(num: string): FlagEntry {
    return (num && flags[num]) || EMPTY_FLAG;
  }

  function onBusFlagsUpdated(bus: string, entry: FlagEntry) {
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

  function sheetHasContent(s: LotSheetData | null | undefined): boolean {
    const cells = s && s.cells ? Object.values(s.cells).filter(Boolean).length : 0;
    const lots = s && s.lots
      ? Object.values(s.lots).reduce((n: number, a) => n + (Array.isArray(a) ? a.length : 0), 0)
      : 0;
    return cells + lots > 0;
  }

  // Save a copy into Prev Sheets (server-side) before it's discarded.
  async function archiveSheet(s: LotSheetData) {
    if (!sheetHasContent(s)) return;
    try {
      await fetch("/api/sheet/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet: s }),
      });
    } catch {}
  }

  function gridHasContent(s: LotSheetData | null | undefined): boolean {
    return !!(s && s.cells && Object.values(s.cells).filter(Boolean).length > 0);
  }
  function lotsHaveContent(s: LotSheetData | null | undefined): boolean {
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
        "Clear the grid for everyone? The current sheet is saved to Prev Sheets first; the grid clears but the back-of-sheet lots stay."
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
    // Clear only the back-of-sheet lots; keep the Turnover-managed lots
    // (R/C, Apron, Lanes, Bay) intact.
    setSheet((s) => ({ ...s, lots: { ...(s.lots || {}), north: [], east: [], fence: [] } }));
  }

  // Bring a previous sheet back as the current shared sheet. The sheet that's up
  // now is archived first (so it isn't lost), and the imported one leaves the
  // archive since you're continuing it.
  async function importSheet(imported: any, id?: string) {
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

  function openCell(id: string, subLabel: string) {
    setEditing({ id, subLabel });
  }

  // Quietly (re)build the PDF in the background so a later "Print PDF" click is
  // instant. Debounced; the server only re-renders if the sheet/flags changed.
  function schedulePrewarm() {
    if (printMode) return;
    const maint = showMaint ? 1 : 0;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?maint=${maint}&prewarm=1`).catch(() => {});
    }, 1500);
  }

  // Server-side PDF: opens a new tab, flushes the latest sheet to the server,
  // then loads the rendered PDF. On desktop it wraps the PDF so the browser's
  // print dialog opens automatically; mobile uses its native PDF viewer.
  function openPdf() {
    // Absolute URL — the print tab opens as about:blank, where a relative
    // "/api/pdf" wouldn't resolve to the site.
    const target = `${window.location.origin}/api/pdf?maint=${showMaint ? 1 : 0}`;
    const isMobile =
      typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const w = window.open("", "_blank"); // open synchronously so it isn't blocked
    const go = () => {
      if (!w) {
        window.location.href = target;
        return;
      }
      if (isMobile) {
        w.location.href = target;
        return;
      }
      // Desktop: show the PDF in an iframe and pop the print dialog once it loads.
      w.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>Lot Sheet</title>' +
          "<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style>" +
          '</head><body><iframe src="' +
          target +
          '"></iframe><script>' +
          'var f=document.getElementsByTagName("iframe")[0];' +
          'f.addEventListener("load",function(){setTimeout(function(){try{f.contentWindow.focus();f.contentWindow.print();}catch(e){}},600);});' +
          "<\/script></body></html>"
      );
      w.document.close();
    };
    fetch("/api/sheet", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet }),
    })
      .then(() => {
        lastSyncRef.current = JSON.stringify(sheet);
      })
      .catch(() => {})
      .finally(go);
  }

  // ---- back-of-sheet lot lists ----
  function lotList(key: string): string[] {
    return (sheet.lots && sheet.lots[key as LotKey]) || [];
  }
  function addToLot(key: string, bus: string) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      return { ...s, lots: { ...lots, [key]: [...(lots[key as LotKey] || []), bus] } as Lots };
    });
  }
  function removeFromLot(key: string, index: number) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      // Flags are NEVER auto-cleared when a bus leaves a lot — they persist
      // until a user clears them in the flag menu.
      return { ...s, lots: { ...lots, [key]: (lots[key as LotKey] || []).filter((_, i) => i !== index) } as Lots };
    });
  }
  function moveInLot(key: string, index: number, dir: number) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = [...(lots[key as LotKey] || [])];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...s, lots: { ...lots, [key]: arr } as Lots };
    });
  }

  // Find where a bus already sits on the sheet — grid cell, front, ROW 11, or a
  // back-of-sheet lot — excluding one cell id (the one being edited). Returns a
  // human location ("Row 9 · #39", "North Lot") or "" if it's not on the sheet.
  // A bus may only appear in one place, so this powers the duplicate guard.
  function locateBus(num: string, exceptCellId: string | null): string {
    if (!num) return "";
    for (const [id, v] of Object.entries(sheet.cells || {})) {
      if (id === exceptCellId) continue;
      const n = cellToNum(v);
      if (n === num) return cellLocationLabel(id);
    }
    // Check every shared lot (North/East/Fence on this sheet, plus the
    // Turnover-managed R/C, Apron, Lanes, and Bay) so a bus can't be in two
    // places.
    const lots = sheet.lots || {};
    for (const [key, arr] of Object.entries(lots)) {
      if (Array.isArray(arr) && arr.includes(num)) return LOT_LOCATION_LABELS[key] || key;
    }
    return "";
  }

  // Pull a bus out of wherever it currently sits (any grid cell or any lot) so
  // it can be dropped into a new spot — powers the editors' "Move it here".
  // BAY is positional (10 fixed spots) so we blank the slot instead of removing it.
  function relocateBus(num: string) {
    if (!num) return;
    setSheet((s) => {
      const cells = { ...s.cells };
      for (const [id, v] of Object.entries(cells)) {
        if (cellToNum(v) === num) delete cells[id];
      }
      const lots: Lots = { ...(s.lots || {}) };
      for (const k of Object.keys(lots) as LotKey[]) {
        const arr = lots[k];
        if (!Array.isArray(arr) || !arr.includes(num)) continue;
        lots[k] = k === "bay" ? arr.map((b) => (b === num ? "" : b)) : arr.filter((b) => b !== num);
      }
      return { ...s, cells, lots };
    });
  }

  // ---- cell renderer ----
  function Cell({ id, slotLabel }: { id: string | null; slotLabel: string | number | null }) {
    const num = getNum(id);
    const entry = num ? flagFor(num) : null;
    const disp = entry ? flagDisplay(entry) : "";
    const miles = entry ? inspMilesDisplay(entry) : "";
    const pin = entry ? pinnedFlagText(entry) : "";
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
        onClick={() => openCell(id!, slotLabel != null ? `Slot ${slotLabel}` : "ROW 11")}
      >
        {slotLabel != null && <span className="cell__slot">{slotLabel}</span>}
        {num && <TypeCodes num={num} className="cell__types" />}
        <span className="cell__num">{busLabel(num)}</span>
        {(disp || miles || pin) && (
          <span className="cell__meta">
            {disp && <span className="cell__flag">{disp}</span>}
            {miles && <span className="cell__insp">{miles}</span>}
            {pin && <span className="cell__pin">{pin}</span>}
          </span>
        )}
      </button>
    );
  }

  // Buses with flags, grouped by most-severe flag, for the back-of-sheet summary.
  const flagSummary = groupFlaggedBuses(flags);

  // Where each bus currently sits on the grid (bus number -> "Row 5 · #85").
  const busLocations: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(sheet.cells || {})) {
    const n = cellToNum(v);
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
          <LayoutGrid size={16} /> Fill Rows
        </button>
        <button className="btn" onClick={() => setManagerOpen(true)}>
          <Flag size={16} /> Edit Flags
        </button>
        <button className="btn" onClick={newSheet}>
          <Eraser size={16} /> Clear Grid
        </button>
        <button className="btn" onClick={clearLots}>
          <ListX size={16} /> Clear Lots
        </button>
        <button className="btn" onClick={() => setPrevOpen(true)}>
          <History size={16} /> Prev Sheets
        </button>
        <SheetSettings
          fontPx={12 + fontDelta}
          minPx={8}
          maxPx={16}
          onFontPx={(px) => setFontDelta(Math.max(-4, Math.min(4, px - 12)))}
        />
        <label className="toolbar__check" title="Include the bus type codes and maintenance flags on the printout">
          <input
            type="checkbox"
            checked={showMaint}
            onChange={(e) => setShowMaint(e.target.checked)}
          />
          Maintenance info
        </label>
        <button className="btn" onClick={() => window.print()} title="Print using the browser (may vary by device)">
          <Printer size={16} /> Print
        </button>
        <button className="btn btn--primary" onClick={openPdf} title="Generate a Letter-size PDF and open the print dialog">
          <FileDown size={16} /> Print PDF
        </button>
      </div>

      {/* The printable sheet */}
      <div className="sheet-scroll" style={{ "--fz": `${FONT_BASE + fontDelta}px` } as CSSProperties}>
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
              const pin = entry ? pinnedFlagText(entry) : "";
              return (
                <button
                  key={`f${c}`}
                  type="button"
                  className={`front ${num ? "front--filled" : ""}`}
                  onClick={() => openCell(id, `ROW ${c + 1} — front bus`)}
                >
                  {num && <TypeCodes num={num} className="front__types" />}
                  <span className="cell__num">{busLabel(num)}</span>
                  {disp && <span className="front__flag">{disp}</span>}
                  {miles && <span className="front__flag front__insp">{miles}</span>}
                  {pin && <span className="front__flag front__pin">{pin}</span>}
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
                return <Cell key={`b${b}c${c}`} id={numberedCellId(slot as number)} slotLabel={slot} />;
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
              <div
                className="backlot"
                key={lot.key}
                role="button"
                tabIndex={0}
                onClick={() => setEditingLot(lot.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingLot(lot.key);
                  }
                }}
              >
                <div className="backlot__head">
                  {lot.title}
                  <span className="backlot__count"> ({lotList(lot.key).length})</span>
                  <span className="backlot__edit no-print"> ✎ edit</span>
                </div>
                <ol className="backlot__list">
                  {lotList(lot.key).map((bus, i) => {
                    const fdisp = flagsFullDisplay(flagFor(bus));
                    return (
                      <li key={i}>
                        <span className="backlot__bus">{busLabel(bus)}</span>
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
                        <span className="flagsum__bus">{busLabel(bus)}</span>
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

      {/* Signals the headless PDF renderer that the sheet + flags have loaded. */}
      {loaded && flagsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}

      {editing && (
        <CellEditor
          subLabel={editing.subLabel}
          value={getNum(editing.id)}
          flags={flags}
          cellId={editing.id}
          locate={locateBus}
          onRelocate={relocateBus}
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
          onRelocate={relocateBus}
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
          onRelocate={relocateBus}
          onAdd={(bus) => addToLot(editingLot, bus)}
          onRemove={(i) => removeFromLot(editingLot, i)}
          onMove={(i, dir) => moveInLot(editingLot, i, dir)}
          onClose={() => setEditingLot(null)}
        />
      )}
    </div>
  );
}
