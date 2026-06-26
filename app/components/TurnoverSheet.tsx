"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { openSheetPdf } from "../lib/pdf";
import { flagsFullDisplay } from "../lib/grid";
import { History, Eraser, FileDown } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import SheetSettings from "./SheetSettings";
import SheetHistory from "./SheetHistory";
import EmployeeInput from "./EmployeeInput";
import ManagerPanel from "./ManagerPanel";
import LotEditor from "./LotEditor";
import type { Employee, FlagEntry, FlagMap, LotKey, TurnoverData } from "../lib/types";

const STORAGE_KEY = "turnover";
const FONT_DEFAULT = 13;
const FONT_MIN = 8;
const FONT_MAX = 16;

const SHIFTS: [string, string][] = [
  ["3rd1st", "3rd to 1st"],
  ["1st2nd", "1st to 2nd"],
  ["2nd3rd", "2nd to 3rd"],
];

// 1:1 with the original sheet: the body spans spreadsheet rows 6–41. The left
// column is one continuous NORTH LOT list with FENCE / R-C / APRON as single
// labeled rows inserted at these positions; the right column is EAST LOT
// (rows 6–29), then the lanes, then employee call-offs.
const BODY_START = 6;
const BODY_END = 41;
const FENCE_ROW = 19;
const RC_ROW = 24;
const APRON_ROW = 32;
const LANE_HDR = 30;
const CALL_HDR = 37;
const BAY_ROWS = 10;

type TurnoverLots = Record<LotKey, string[]>;

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
function emptyData(): TurnoverData {
  return { cells: {}, shift: "" };
}

export default function TurnoverSheet() {
  const { label: busLabel } = useBusMaster();
  const [data, setData] = useState<TurnoverData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [fontPx, setFontPx] = useState(FONT_DEFAULT);
  const [printFlags, setPrintFlags] = useState(true); // print the filled sheet? (off = blank form)
  const [prevOpen, setPrevOpen] = useState(false);

  const [lots, setLots] = useState<TurnoverLots>({
    north: [], east: [], fence: [], rc: [], apron: [], northlane: [], southlane: [], bay: [],
  });
  const [lotsLoaded, setLotsLoaded] = useState(false);
  const lotDirty = useRef(false);
  const lotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [editingLot, setEditingLot] = useState<LotKey | null>(null);

  const [flags, setFlags] = useState<FlagMap>({});
  const [flagBus, setFlagBus] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const isPrint = param("print") === "1";
    setPrintMode(isPrint);
    if (isPrint) {
      const fz = parseInt(param("fz") || "", 10);
      if (!Number.isNaN(fz)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, fz)));
      setPrintFlags(param("maint") === "1");
    } else {
      const v = parseInt(localStorage.getItem(`pace:font:${STORAGE_KEY}`) || "", 10);
      if (!Number.isNaN(v)) setFontPx(Math.max(FONT_MIN, Math.min(FONT_MAX, v)));
      setPrintFlags(localStorage.getItem(`pace:flags:${STORAGE_KEY}`) !== "0"); // default on
    }
  }, []);
  useEffect(() => {
    if (printMode) return;
    localStorage.setItem(`pace:font:${STORAGE_KEY}`, String(fontPx));
  }, [fontPx, printMode]);
  useEffect(() => {
    if (printMode) return;
    localStorage.setItem(`pace:flags:${STORAGE_KEY}`, printFlags ? "1" : "0");
  }, [printFlags, printMode]);

  // Auto-fill today's date (MM / DD / YY) when the sheet has no date yet.
  useEffect(() => {
    if (!loaded || printMode) return;
    setData((d) => {
      if (d.cells["date-m"] || d.cells["date-d"] || d.cells["date-y"]) return d;
      const now = new Date();
      return {
        ...d,
        cells: {
          ...d.cells,
          "date-m": String(now.getMonth() + 1).padStart(2, "0"),
          "date-d": String(now.getDate()).padStart(2, "0"),
          "date-y": String(now.getFullYear()).slice(-2),
        },
      };
    });
  }, [loaded, printMode]);

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
  function onBusFlagsUpdated(bus: string, entry: FlagEntry) {
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
            rc: s.lots?.rc || [],
            apron: s.lots?.apron || [],
            northlane: s.lots?.northlane || [],
            southlane: s.lots?.southlane || [],
            bay: s.lots?.bay || [],
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

  function patchLots(nextLots: TurnoverLots) {
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
  // BAY is 10 fixed spots — type the bus into each (no reorder). Stored as a
  // 10-length array so the duplicate guard still finds the bus.
  function setBayBus(i: number, raw: string) {
    const b = sanitizeBus(raw);
    const arr = Array.from({ length: BAY_ROWS }, (_, j) => (lots.bay || [])[j] || "");
    arr[i] = b;
    patchLots({ ...lots, bay: arr });
  }
  const addToLot = (key: LotKey, bus: string) =>
    patchLots({ ...lots, [key]: [...(lots[key] || []), bus] } as TurnoverLots);
  const removeFromLot = (key: LotKey, i: number) =>
    patchLots({ ...lots, [key]: (lots[key] || []).filter((_, j) => j !== i) } as TurnoverLots);
  function moveInLot(key: LotKey, i: number, dir: number) {
    const arr = [...(lots[key] || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchLots({ ...lots, [key]: arr } as TurnoverLots);
  }
  const LOT_LABELS: Record<LotKey, string> = {
    north: "North Lot", east: "East Lot", fence: "Fence", rc: "R/C", apron: "Apron",
    northlane: "North Lane", southlane: "South Lane", bay: "Bay",
  };
  function locateLot(bus: string): string {
    for (const k of Object.keys(LOT_LABELS) as LotKey[]) {
      if ((lots[k] || []).includes(bus)) return LOT_LABELS[k];
    }
    return "";
  }

  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/${STORAGE_KEY}&fz=${fontPx}&maint=${printFlags ? 1 : 0}&prewarm=1`).catch(() => {});
    }, 1500);
  }
  useEffect(() => {
    if (loaded) schedulePrewarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontPx, flags, printFlags]);

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

  function setCell(key: string, value: string) {
    setData((d) => ({ ...d, cells: { ...d.cells, [key]: value } }));
  }
  function setShift(value: string) {
    setData((d) => ({ ...d, shift: d.shift === value ? "" : value }));
  }
  const hasContent = (d: TurnoverData | null | undefined) =>
    !!(d && (d.shift || Object.values(d.cells || {}).some((v) => v && String(v).trim())));

  async function archiveCurrent() {
    if (!hasContent(data)) return;
    await fetch(`/api/state/${STORAGE_KEY}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: data }),
    }).catch(() => {});
  }
  async function clearAll() {
    if (!window.confirm("Clear this Turnover sheet? The current one is saved to Prev Sheets first. (Shared lots and bus flags are NOT cleared.)")) return;
    await archiveCurrent();
    setData(emptyData());
  }
  async function importSheet(imported: any, id?: string) {
    if (!imported) return;
    await archiveCurrent();
    setData({ ...emptyData(), ...imported });
    if (id) fetch(`/api/state/${STORAGE_KEY}/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setPrevOpen(false);
  }
  function printPdf() {
    openSheetPdf({
      path: `/${STORAGE_KEY}`,
      maint: printFlags, // off = print a completely blank form
      params: { fz: fontPx },
      flush: () =>
        fetch(`/api/state/${STORAGE_KEY}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
    });
  }

  const E = (key: string, props: Partial<ComponentProps<typeof EmployeeInput>> = {}) => (
    <EmployeeInput value={data.cells[key] || ""} onChange={(v) => setCell(key, v)} employees={employees} {...props} />
  );
  const C = (key: string, props: ComponentProps<"input"> = {}) => (
    <input className="turnt__in" value={data.cells[key] || ""} onChange={(e) => setCell(key, e.target.value)} {...props} />
  );

  // A lot slot: MECH (employee) | VEH# (shared list; click to add/reorder) |
  // REASON (the bus's flags; click to edit flags). Empty slots open the editor.
  function lotSlot(lotKey: LotKey, idx: number, reasonSpan: number) {
    const bus = (lots[lotKey] || [])[idx] || "";
    return (
      <>
        <td className="turnt__c">{bus ? E(`mech-${bus}`, { className: "turnt__in turnt__in--c" }) : null}</td>
        <td className="turnt__c turnt__veh turnt__veh--btn" onClick={() => setEditingLot(lotKey)}>
          {bus ? busLabel(bus) : ""}
        </td>
        <td
          colSpan={reasonSpan}
          className="turnt__reason turnt__reason--btn"
          onClick={bus ? () => setFlagBus(bus) : () => setEditingLot(lotKey)}
        >
          {bus ? flagsFullDisplay(flags[bus]) : ""}
        </td>
      </>
    );
  }

  // A single-column bus-list cell (lanes / bay halves): shows the bus; click to
  // add/reorder via the lot editor. `prefix` is an optional leading label.
  function busListCell(lotKey: LotKey, i: number, colSpan: number, prefix?: ReactNode) {
    const bus = (lots[lotKey] || [])[i] || "";
    return (
      <td colSpan={colSpan} className="turnt__listcell turnt__veh--btn" onClick={() => setEditingLot(lotKey)}>
        {prefix}
        <span className="turnt__listbus">{bus ? busLabel(bus) : ""}</span>
      </td>
    );
  }

  // A label divider row inside the left column (FENCE / R-C / APRON) — click to
  // manage that lot.
  const divider = (lotKey: LotKey, label: string) => (
    <>
      <td />
      <td className="turnt__divlbl turnt__veh--btn" onClick={() => setEditingLot(lotKey)}>
        {label} <span className="turnt__edit">✎</span>
      </td>
      <td colSpan={2} />
    </>
  );

  // Build the left/right cells for each spreadsheet body row (6–41). The left
  // column is four stacked bus lists separated by the labels.
  let northIdx = 0;
  let fenceIdx = 0;
  let rcIdx = 0;
  let apronIdx = 0;
  let eastIdx = 0;
  const rows: ReactNode[] = [];
  for (let sr = BODY_START; sr <= BODY_END; sr++) {
    let left: ReactNode;
    if (sr === FENCE_ROW) left = divider("fence", "FENCE");
    else if (sr === RC_ROW) left = divider("rc", "R/C");
    else if (sr === APRON_ROW) left = divider("apron", "APRON");
    else if (sr < FENCE_ROW) left = lotSlot("north", northIdx++, 2);
    else if (sr < RC_ROW) left = lotSlot("fence", fenceIdx++, 2);
    else if (sr < APRON_ROW) left = lotSlot("rc", rcIdx++, 2);
    else left = lotSlot("apron", apronIdx++, 2);

    let right: ReactNode;
    if (sr === LANE_HDR) {
      right = (
        <>
          <td />
          <td className="turnt__head" colSpan={2}>NORTH LANE</td>
          <td className="turnt__head" colSpan={2}>SOUTH LANE</td>
        </>
      );
    } else if (sr > LANE_HDR && sr < CALL_HDR) {
      const i = sr - LANE_HDR - 1;
      right = (
        <>
          <td />
          {busListCell("northlane", i, 2)}
          {busListCell("southlane", i, 2)}
        </>
      );
    } else if (sr === CALL_HDR) {
      right = (
        <>
          <td />
          <td className="turnt__head" colSpan={4}>EMPLOYEE CALLOFFS</td>
        </>
      );
    } else if (sr > CALL_HDR) {
      right = (
        <>
          <td />
          <td colSpan={4}>{E(`calloff-${sr - CALL_HDR - 1}`)}</td>
        </>
      );
    } else {
      right = lotSlot("east", eastIdx++, 3);
    }

    rows.push(
      <tr key={sr}>
        {left}
        {right}
      </tr>
    );
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
        <label className="toolbar__check" title="Off = print a completely blank form">
          <input type="checkbox" checked={printFlags} onChange={(e) => setPrintFlags(e.target.checked)} />
          Print with flags
        </label>
        <button className="btn" onClick={() => setPrevOpen(true)}><History size={16} /> Prev Sheets</button>
        <button className="btn" onClick={clearAll}><Eraser size={16} /> Clear</button>
        <button className="btn btn--primary" onClick={printPdf}><FileDown size={16} /> Print PDF</button>
      </div>

      <div className="sheet-scroll" style={{ "--tfz": `${fontPx}px` } as CSSProperties}>
        <div className={`sheet turn-sheet ${!printFlags ? "turn-sheet--blank" : ""}`}>
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
              {/* Title (top-right) */}
              <tr className="turnt__band">
                <td colSpan={5} />
                <td colSpan={4} className="turnt__brand">SHIFT TURNOVER</td>
              </tr>
              {/* Foreman (left) + shift selector (right, spans 2 rows) */}
              <tr className="turnt__band">
                <td colSpan={3} className="turnt__field">
                  <div className="turnt__fline">
                    <span className="turnt__fieldlbl">FOREMAN / SR:</span>
                    {C("foreman", { className: "turnt__in turnt__in--fill" })}
                  </div>
                </td>
                <td />
                <td />
                <td colSpan={4} rowSpan={2} className="turnt__shiftpick">
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
              {/* Date (left) — three blanks like the original */}
              <tr className="turnt__band">
                <td colSpan={3} className="turnt__field">
                  <div className="turnt__fline">
                    <span className="turnt__fieldlbl">DATE:</span>
                    {C("date-m", { className: "turnt__in turnt__datein" })}
                    <span className="turnt__slash">/</span>
                    {C("date-d", { className: "turnt__in turnt__datein" })}
                    <span className="turnt__slash">/</span>
                    {C("date-y", { className: "turnt__in turnt__datein" })}
                  </div>
                </td>
                <td />
                <td />
              </tr>
              {/* Section headers (click the header OR a vehicle number to manage buses) */}
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
              {rows}
              {/* Bay table (header underlined but NOT shaded) */}
              <tr className="turnt__head turnt__head--plain">
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
                    <td className="turnt__c">
                      <input
                        className="turnt__in turnt__in--c"
                        inputMode="numeric"
                        value={(lots.bay || [])[i] || ""}
                        onChange={(e) => setBayBus(i, e.target.value)}
                      />
                    </td>
                    <td colSpan={3}>
                      <div className="turnt__fline">
                        <span className="turnt__bayno">{n})</span>
                        {E(`bay1h-${n}`, { className: "turnt__in turnt__in--fill" })}
                      </div>
                    </td>
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
          title={LOT_LABELS[editingLot] || editingLot}
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
        <ManagerPanel flags={flags} initialBus={flagBus} onClose={() => setFlagBus(null)} onBusFlagsUpdated={onBusFlagsUpdated} />
      )}

      {prevOpen && (
        <SheetHistory
          apiBase={`/api/state/${STORAGE_KEY}/history`}
          title="Turnover — Prev Sheets"
          describe={(s) => {
            const c = s?.cells || {};
            const date = [c["date-m"], c["date-d"], c["date-y"]].filter(Boolean).join("/");
            const n = Object.values(c).filter((v) => v && String(v).trim()).length;
            return { title: date ? `Date: ${date}` : "—", meta: `${n} field${n === 1 ? "" : "s"} filled` };
          }}
          onImport={importSheet}
          onClose={() => setPrevOpen(false)}
        />
      )}

      {loaded && lotsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
