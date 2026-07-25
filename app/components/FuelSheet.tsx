"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FUEL_COLUMNS } from "../lib/fuelBuses";
import { openSheetPdf } from "../lib/pdf";
import { fuelIndicator } from "../lib/grid";
import { Flag, History, Eraser, FileDown, FileText, MoreHorizontal } from "lucide-react";
import { useBusMaster } from "./BusMasterProvider";
import ManagerPanel from "./ManagerPanelLazy";
import SheetHistory from "./SheetHistory";
import DatePickerField from "./DatePickerField";
import { chicagoDateShort } from "../lib/chicagoTime";
import { useFlags } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import type { FlagEntry, FlagMap } from "../lib/types";
import { ActionMenu, Button, ConfirmDialog, Toolbar, ToolbarGroup } from "../ui";
import { PaperViewport } from "../sheets/core";
import { LETTER_PORTRAIT } from "../sheets/core/profiles";
import chromeStyles from "./SheetChrome.module.css";

const FONT_DEFAULT = 16;
const FONT_MIN = 8;
const FONT_MAX = 16;

interface FuelEntry {
  gals: string;
  serv: string;
}
interface FuelData {
  date: string;
  ns: string;
  start: string;
  end: string;
  entries: Record<string, FuelEntry>;
}
type FuelStringField = "date" | "ns" | "start" | "end";

// The Fuel/DEF list now comes from the master "lane" membership (active + the
// Fuel/DEF toggle), kept in the sheet's familiar order: the original column
// order first, then any newly-added lane buses appended. The grid stays at 4
// columns × 35 rows (the paper layout) unless the lane outgrows it.
const BASE_ORDER = FUEL_COLUMNS.flat().map(String);

function buildLaneColumns(laneList: string[]) {
  const laneSet = new Set(laneList);
  const baseSet = new Set(BASE_ORDER);
  const ordered = BASE_ORDER.filter((n) => laneSet.has(n));
  const extras = laneList.filter((n) => !baseSet.has(n));
  const list = [...ordered, ...extras];
  const total = list.length;
  const rows = Math.max(35, Math.ceil((total + 1) / 4));
  const columns: (string | null)[][] = [[], [], [], []];
  for (let i = 0; i < total; i++) columns[Math.floor(i / rows)][i % rows] = list[i];
  for (const c of columns) while (c.length < rows) c.push(null);
  return { columns, rows, total };
}

// Read a query param on the client (the headless PDF loads this page at
// <path>?print=1).
function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
const COL_HEADERS = ["BUS", "GALS", "SERV", "BUS", "GALS", "SERV", "BUS", "GALS", "SERV", "BUS", "GALS", "SERV"];

function emptyData(): FuelData {
  return { date: "", ns: "", start: "", end: "", entries: {} };
}
// The date the sheet is printed, as MM/DD/YY (e.g. 06/25/26).
function printDate(): string {
  return chicagoDateShort();
}
function sanitizeGals(raw: string): string {
  let s = String(raw).replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s.slice(0, 6);
}

interface FuelSheetProps {
  title: string;
  storageKey: string;
  showShiftFields?: boolean;
  // Print an N-circled copy + an S-circled copy (the DEF sheet's two lanes).
  laneCopies?: boolean;
  // Render the #print-ready marker (a composite print page renders its own).
  marker?: boolean;
  // Embedded previews use the shared Service Sheets controls instead of
  // repeating one toolbar above every paper page.
  embedded?: boolean;
  // Controlled by the Service Sheets "Include flags" switch.
  showFlags?: boolean;
  // The All tab previews the same N/S copies the combined PDF will create.
  previewLaneCopies?: boolean;
  // One shared date across the Service Sheets All preview and combined PDF.
  dateOverride?: string;
  // Composite print pages wait until every embedded sheet has loaded.
  onReady?: (ready: boolean) => void;
  // Lets the shared Print All control flush the latest in-progress edits first.
  onRegisterFlush?: (flush: (() => Promise<unknown>) | null) => void;
}

export default function FuelSheet({
  title,
  storageKey,
  showShiftFields = false,
  laneCopies = false,
  marker = true,
  embedded = false,
  showFlags,
  previewLaneCopies = false,
  dateOverride = "",
  onReady,
  onRegisterFlush,
}: FuelSheetProps) {
  const [data, setData] = useState<FuelData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [blankMode, setBlankMode] = useState(false);
  const [laneVariant, setLaneVariant] = useState(false); // ?variant=ns on the print URL
  const [fontPx, setFontPx] = useState(FONT_DEFAULT);
  const { data: busFlags = {} } = useFlags(); // universal flags from the shared live cache
  const qc = useQueryClient();
  const [managerOpen, setManagerOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataRef = useRef<FuelData>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!onRegisterFlush) return;
    const flush = () =>
      fetch(`/api/state/${storageKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: dataRef.current }),
      });
    onRegisterFlush(flush);
    return () => onRegisterFlush(null);
  }, [onRegisterFlush, storageKey]);

  // Optimistically patch the shared flag cache when the editor changes a bus (it
  // also posts to /api/flags itself), so the indicators + summary update instantly;
  // the /api/live pulse then reconciles with the server.
  function onFlagsUpdated(bus: string, entry: FlagEntry) {
    qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [bus]: entry }));
  }

  useEffect(() => {
    const isPrint = param("print") === "1";
    setPrintMode(isPrint);
    setBlankMode(param("blank") === "1");
    setLaneVariant(param("variant") === "ns");
    // The headless PDF render gets the chosen size via the query so the
    // printout matches the screen (it has no localStorage of its own).
    if (isPrint) {
      const fz = parseInt(param("fz") || "", 10);
      if (!Number.isNaN(fz)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, fz)));
    }
  }, [storageKey]);

  // Quietly (re)build the cached PDF after edits (or a font change) so the next
  // "Print PDF" is instant. Keyed to fz so the prewarm matches what we print.
  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/${storageKey}&fz=${fontPx}&maint=1${laneCopies ? "&variant=ns" : ""}&prewarm=1`).catch(() => {});
    }, 1500);
  }
  useEffect(() => {
    if (loaded) schedulePrewarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontPx, busFlags]);

  useEffect(() => {
    if (param("blank") === "1") {
      setData(emptyData());
      setLoaded(true);
      return;
    }
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

  useEffect(() => {
    if (!loaded || printMode || !dateOverride) return;
    setData((current) => (current.date === dateOverride ? current : { ...current, date: dateOverride }));
  }, [dateOverride, loaded, printMode]);

  function setField(field: FuelStringField, value: string) {
    setData((d) => ({ ...d, [field]: value }));
  }
  function setEntry(bus: string, key: keyof FuelEntry, value: string) {
    setData((d) => {
      const cur = d.entries[bus] || { gals: "", serv: "" };
      const next = { ...cur, [key]: value };
      const entries = { ...d.entries };
      if (!next.gals && !next.serv) delete entries[bus];
      else entries[bus] = next;
      return { ...d, entries };
    });
  }
  function hasContent(d: FuelData | null | undefined): boolean {
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
    await archiveCurrent();
    setData(emptyData());
  }
  // The current sheet is archived first (so it isn't lost), the chosen one is
  // loaded, and it leaves the archive since you're continuing it.
  async function importSheet(imported: any, id?: string) {
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
      maint: true, // regular prints always carry the R/H/I flags
      params: { fz: fontPx, ...(laneCopies ? { variant: "ns" } : {}) },
      flush: () =>
        fetch(`/api/state/${storageKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
    });
  }
  function printBlank() {
    openSheetPdf({
      path: `/${storageKey}`,
      maint: false,
      params: { blank: 1, fz: fontPx },
    });
  }

  const { laneBuses, ready: busReady } = useBusMaster();
  const { columns, rows, total } = buildLaneColumns(laneBuses());
  const flagsEnabled = !blankMode && (showFlags ?? param("maint") !== "0");

  useEffect(() => {
    onReady?.(loaded && busReady);
  }, [busReady, loaded, onReady]);

  // The 3 cells for one column-group at a given row (BUS, GALS, SERV).
  function groupCells(g: number, r: number) {
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
    const ind = flagsEnabled ? fuelIndicator(busFlags[bus]) : "";
    return [
      <td key={`${g}-b`} className={`fuelt__bus ${ind ? "fuelt__bus--flagged" : ""}`}>
        <span className="fuelt__buscontent">
          {ind && (
            <span className="fuelt__ind">
              <span className="fuelt__indl">{ind}</span>
            </span>
          )}
          <span className="fuelt__busnum">{bus}</span>
        </span>
      </td>,
      <td key={`${g}-g`}>
        {!blankMode && (
          <input
            className="fuelt__in"
            inputMode="decimal"
            value={e.gals}
            onChange={(ev) => setEntry(bus, "gals", sanitizeGals(ev.target.value))}
          />
        )}
      </td>,
      <td key={`${g}-s`}>
        {!blankMode && (
          <input
            className="fuelt__in"
            value={e.serv}
            maxLength={4}
            onChange={(ev) => setEntry(bus, "serv", ev.target.value.toUpperCase())}
          />
        )}
      </td>,
    ];
  }

  const requestedDate = dateOverride || param("dateOverride") || "";
  const displayDate = blankMode ? "" : requestedDate || (data.date && data.date.trim() ? data.date : printDate());
  // Which copies to render: normally one plain sheet; the DEF/farebox PDF
  // prints an N-circled copy and an S-circled copy; blanks are a single plain
  // copy with a plain, uncircled lane indicator.
  const lanes: ("n" | "s" | null)[] =
    !blankMode && ((printMode && laneVariant) || previewLaneCopies) ? ["n", "s"] : [null];

  // The lane indicator: plain "N / S" for pen-circling, or the copy's lane
  // circled when the PDF prints one copy per lane; blank DEF keeps plain N / S.
  function nsField(lane: "n" | "s" | null) {
    return (
      <span className="fuelt__field fuelt__ns">
        <span className={lane === "n" ? "lanemark lanemark--circled" : "lanemark"}>N</span>
        <span className="fuelt__nssep">/</span>
        <span className={lane === "s" ? "lanemark lanemark--circled" : "lanemark"}>S</span>
      </span>
    );
  }

  return (
    <div className={chromeStyles.page}>
      {!embedded && <Toolbar className={`${chromeStyles.toolbar} no-print`}>
        <div className={chromeStyles.title}>{title}</div>
        <DatePickerField
          className={chromeStyles.date}
          value={data.date || displayDate}
          onValueChange={(value) => setField("date", value)}
          shortYear
          ariaLabel={`${title} date`}
          variant="ui"
        />
        <ToolbarGroup className={chromeStyles.actions}>
          <span className={chromeStyles.saved}>
            {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
          </span>
          <Button onPress={() => setManagerOpen(true)}>
            <Flag aria-hidden="true" /> Edit Flags
          </Button>
          <ActionMenu
            label={<><MoreHorizontal size={16} /> More</>}
            items={[
              { id: "history", label: "Previous sheets", icon: <History size={16} /> },
              { id: "clear", label: "Clear sheet", icon: <Eraser size={16} />, tone: "danger" },
            ]}
            onAction={(key) => {
              if (key === "history") setPrevOpen(true);
              if (key === "clear") setClearOpen(true);
            }}
          />
          <Button onPress={printBlank}>
            <FileText aria-hidden="true" /> Print Blank
          </Button>
          <Button variant="primary" onPress={printPdf}>
            <FileDown aria-hidden="true" /> Print PDF
          </Button>
        </ToolbarGroup>
      </Toolbar>}

      <PaperViewport
        profile={LETTER_PORTRAIT}
        fitOnMobile
        label={`${title} paper preview`}
        style={{ "--ffz": `${fontPx}px` } as CSSProperties}
      >
        {lanes.map((lane) => (
          <div
            className={`sheet fuel-sheet ${flagsEnabled ? "fuel-sheet--flags" : ""}`}
            key={lane ?? "x"}
            data-paper-page=""
            data-paper-profile="letter-portrait"
            data-sheet-id={storageKey}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sheet-brand-logo" src="/logo.png" alt="Pace" />
            <table className="fuelt">
              <colgroup>
                {Array.from({ length: 4 }).flatMap((_, group) => [
                  <col className="fuelt__col--bus" key={`${group}-bus`} />,
                  <col className="fuelt__col--entry" key={`${group}-gals`} />,
                  <col className="fuelt__col--entry" key={`${group}-serv`} />,
                ])}
              </colgroup>
              <tbody>
                {/* Header row (title + date / shift fields) */}
                <tr className="fuelt__hdr">
                  {showShiftFields ? (
                    <td colSpan={12}>
                      <div className="fuelt__hdrrow">
                        <span className="fuelt__name">{title}</span>
                        <span className="fuelt__field fuelt__field--date">
                          DATE: <span className="fuelt__date"><span className="fuelt__dateval">{displayDate}</span></span>
                        </span>
                        {nsField(lane)}
                        <span className="fuelt__field fuelt__field--time">
                          START:{" "}
                          {blankMode ? (
                            <span className="fuelt__hin fuelt__hin--line" />
                          ) : (
                            <input className="fuelt__hin fuelt__hin--line" value={data.start} onChange={(e) => setField("start", e.target.value)} />
                          )}
                        </span>
                        <span className="fuelt__field fuelt__field--time">
                          END:{" "}
                          {blankMode ? (
                            <span className="fuelt__hin fuelt__hin--line" />
                          ) : (
                            <input className="fuelt__hin fuelt__hin--line" value={data.end} onChange={(e) => setField("end", e.target.value)} />
                          )}
                        </span>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td colSpan={6}>
                        <span className="fuelt__name">{title}</span>
                      </td>
                      <td colSpan={6}>
                        DATE: <span className="fuelt__date"><span className="fuelt__dateval">{displayDate}</span></span>
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
        ))}
      </PaperViewport>

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

      <ConfirmDialog
        isOpen={clearOpen}
        onOpenChange={setClearOpen}
        title={`Clear the ${title}?`}
        description="The current sheet is saved to Previous Sheets before it is cleared."
        confirmLabel="Clear sheet"
        tone="danger"
        onConfirm={clearAll}
      />

      {/* Signals the headless PDF renderer that the sheet + bus list have loaded. */}
      {marker && loaded && busReady && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
