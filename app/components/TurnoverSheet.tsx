"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { openSheetPdf } from "../lib/pdf";
import { closestFlagMatch, flagsFullDisplay, inspectionOptionFromText, setInspectionOption } from "../lib/grid";
import { addCustomNote } from "../lib/customNoteFlags";
import { fleetStats } from "../lib/fleetStats";
import { History, Eraser, FileDown, MoreHorizontal, Check } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import SheetHistory from "./SheetHistory";
import EmployeeInput from "./EmployeeInput";
import ManagerPanel from "./ManagerPanelLazy";
import LotEditor from "./LotEditorLazy";
import DatePickerField from "./DatePickerField";
import { chicagoParts } from "../lib/chicagoTime";
import { getDeviceActor } from "../lib/deviceActor";
import { useBusMasterList, useEmployees, useFlags, useLotSheet } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import type { FlagEntry, FlagMap, LotKey, TurnoverData } from "../lib/types";
import { ActionMenu, Button, ConfirmDialog, StaticChip, Toolbar, ToolbarGroup } from "../ui";
import { PaperViewport, SheetRevision } from "../sheets/core";
import { LEGAL_PORTRAIT } from "../sheets/core/profiles";
import chromeStyles from "./SheetChrome.module.css";
import styles from "./TurnoverSheet.module.css";

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
type TurnoverClearTarget = { key: LotKey; label: string; count: number };
type TurnoverUndo = { key: LotKey; label: string; value: string[] };

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
  const [clearOpen, setClearOpen] = useState(false);
  const [findVal, setFindVal] = useState(""); // toolbar "find bus" box

  const [lots, setLots] = useState<TurnoverLots>({
    north: [], east: [], fence: [], rc: [], apron: [], northlane: [], southlane: [], bay: [], cards: [],
  });
  const [lotsLoaded, setLotsLoaded] = useState(false);
  const lotDirty = useRef(false);
  const lotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lotsRef = useRef<TurnoverLots>(lots);
  const pendingClear = useRef<string[]>([]);
  const pendingLotKeys = useRef<Set<LotKey>>(new Set());
  const pendingClearKeys = useRef<Set<LotKey>>(new Set());
  const lotWriteVersion = useRef(0);
  const [editingLot, setEditingLot] = useState<LotKey | null>(null);
  const [clearLotTarget, setClearLotTarget] = useState<TurnoverClearTarget | null>(null);
  const [undoLot, setUndoLot] = useState<TurnoverUndo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Universal flags + employee roster from the shared, deduplicated, live cache.
  const { data: flags = {} } = useFlags();
  // Live fleet counts for the toolbar chips (same math as the Lot Sheet bar).
  const { data: lotSheetData } = useLotSheet();
  const { data: masterBuses = [] } = useBusMasterList();
  const fleet = useMemo(
    () => fleetStats(lotSheetData?.sheet || null, flags, masterBuses),
    [lotSheetData, flags, masterBuses],
  );
  const qc = useQueryClient();
  const [flagBus, setFlagBus] = useState<string | null>(null);

  const { data: employees = [] } = useEmployees();
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
      setPrintFlags(localStorage.getItem(`pace:flags:${STORAGE_KEY}`) !== "0"); // default on
    }
  }, []);
  useEffect(() => {
    if (printMode) return;
    localStorage.setItem(`pace:flags:${STORAGE_KEY}`, printFlags ? "1" : "0");
  }, [printFlags, printMode]);

  // Auto-fill today's date (MM / DD / YY) when the sheet has no date yet.
  useEffect(() => {
    if (!loaded) return;
    setData((d) => {
      if (d.cells["date-m"] || d.cells["date-d"] || d.cells["date-y"]) return d;
      const now = chicagoParts();
      return {
        ...d,
        cells: {
          ...d.cells,
          "date-m": now.month,
          "date-d": now.day,
          "date-y": now.year.slice(-2),
        },
      };
    });
  }, [loaded, data.cells["date-m"], data.cells["date-d"], data.cells["date-y"]]);

  // Optimistically patch the shared flag cache so a just-set flag shows instantly;
  // the /api/live pulse then reconciles with the server.
  function onBusFlagsUpdated(bus: string, entry: FlagEntry) {
    qc.setQueryData<FlagMap>(["flags"], (prev = {}) => {
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

  async function commitBayFirstHalf(bus: string, key: string) {
    const typed = (data.cells[key] || "").trim();
    if (!typed || !bus || bus === "X") return;

    // Merge into the newest shared flags so this shortcut cannot erase a flag
    // that another device added while the Turnover sheet was open.
    const latest = await fetch("/api/flags", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => (body.flags || {}) as FlagMap)
      .catch(() => flags);
    const current = latest[bus] || {
      flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "",
    };
    const inspection = inspectionOptionFromText(typed);
    const matched = inspection ? null : closestFlagMatch(typed);
    const next: FlagEntry = inspection
      ? setInspectionOption(current, inspection.id)
      : matched
      ? { ...current, flags: Array.from(new Set([...(current.flags || []), matched.id])) }
      : addCustomNote(current, typed);

    const saved = await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bus, ...next, actor: getDeviceActor() }),
    }).then((response) => response.ok).catch(() => false);
    if (!saved) return;
    onBusFlagsUpdated(bus, next);
    setCell(key, "");
  }

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sheet", { cache: "no-store" })
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
            cards: s.lots?.cards || [],
          });
          lotsRef.current = {
            north: s.lots?.north || [],
            east: s.lots?.east || [],
            fence: s.lots?.fence || [],
            rc: s.lots?.rc || [],
            apron: s.lots?.apron || [],
            northlane: s.lots?.northlane || [],
            southlane: s.lots?.southlane || [],
            bay: s.lots?.bay || [],
            cards: s.lots?.cards || [],
          };
        })
        .catch(() => {})
        .finally(() => alive && setLotsLoaded(true));
    load();
    const iv = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  function scheduleLotPatch(delay = 500) {
    clearTimeout(lotTimer.current);
    lotTimer.current = setTimeout(() => {
      const clearBuses = [...new Set(pendingClear.current)];
      pendingClear.current = [];
      const lotKeys = [...pendingLotKeys.current];
      const groupClears = [...pendingClearKeys.current];
      pendingLotKeys.current.clear();
      pendingClearKeys.current.clear();
      const changedLots = Object.fromEntries(
        lotKeys.map((key) => [key, lotsRef.current[key] || []]),
      );
      const writeVersion = lotWriteVersion.current;
      fetch("/api/sheet", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lots: changedLots,
          clearKeys: groupClears,
          clearBuses,
          actor: getDeviceActor(),
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Sheet save failed (${response.status})`);
          return response.json();
        })
        .then((result) => {
          if (
            writeVersion === lotWriteVersion.current
            && pendingLotKeys.current.size === 0
            && pendingClearKeys.current.size === 0
            && pendingClear.current.length === 0
          ) {
            lotDirty.current = false;
          }
          if (result.updatedAt) setSavedAt(new Date(result.updatedAt));
          schedulePrewarm();
        })
        .catch(() => {
          for (const key of new Set([...lotKeys, ...groupClears])) {
            pendingClearKeys.current.delete(key);
            pendingLotKeys.current.add(key);
          }
          pendingClear.current = [...new Set([...clearBuses, ...pendingClear.current])];
          lotDirty.current = true;
          scheduleLotPatch(1200);
        });
    }, delay);
  }

  // Send only the location groups changed on this page. This prevents a
  // Turnover edit from replacing a simultaneous Shop or Lot Sheet edit.
  function patchLots(nextLots: TurnoverLots, changedKeys: LotKey[] = [], clearKeys: LotKey[] = []) {
    setLots(nextLots);
    lotsRef.current = nextLots;
    lotDirty.current = true;
    lotWriteVersion.current += 1;
    for (const key of changedKeys) {
      pendingClearKeys.current.delete(key);
      pendingLotKeys.current.add(key);
    }
    for (const key of clearKeys) {
      pendingLotKeys.current.delete(key);
      pendingClearKeys.current.add(key);
    }
    scheduleLotPatch();
  }
  // BAY is 10 fixed spots — type the bus into each (no reorder). Stored as a
  // 10-length array so the duplicate guard still finds the bus.
  function setBayBus(i: number, raw: string) {
    const b = sanitizeBus(raw);
    const current = lotsRef.current;
    const arr = Array.from({ length: BAY_ROWS }, (_, j) => (current.bay || [])[j] || "");
    arr[i] = b;
    patchLots({ ...current, bay: arr }, ["bay"]);
  }
  const addToLot = (key: LotKey, bus: string) =>
    patchLots({ ...lotsRef.current, [key]: [...(lotsRef.current[key] || []), bus] } as TurnoverLots, [key]);
  const removeFromLot = (key: LotKey, i: number) =>
    patchLots({ ...lotsRef.current, [key]: (lotsRef.current[key] || []).filter((_, j) => j !== i) } as TurnoverLots, [key]);
  function moveInLot(key: LotKey, i: number, dir: number) {
    const arr = [...(lotsRef.current[key] || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchLots({ ...lotsRef.current, [key]: arr } as TurnoverLots, [key]);
  }
  // Drag-to-reorder inside a lot list: lift the bus at `from` and drop it at `to`.
  function reorderInLot(key: LotKey, from: number, to: number) {
    const arr = [...(lotsRef.current[key] || [])];
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return;
    const [bus] = arr.splice(from, 1);
    arr.splice(to, 0, bus);
    patchLots({ ...lotsRef.current, [key]: arr } as TurnoverLots, [key]);
  }
  const LOT_LABELS: Record<LotKey, string> = {
    north: "North Lot", east: "East Lot", fence: "Fence", rc: "R/C", apron: "Apron",
    northlane: "North Lane", southlane: "South Lane", bay: "Bay", cards: "Cards",
  };

  async function archiveCurrentLotSheet() {
    try {
      const current = await fetch("/api/sheet", { cache: "no-store" }).then((response) => response.json());
      if (!current?.sheet) return;
      await fetch("/api/sheet/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet: current.sheet }),
      });
    } catch {}
  }

  function offerLotUndo(next: TurnoverUndo) {
    setUndoLot(next);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoLot(null), 6000);
  }

  function requestClearLot(key: LotKey) {
    const count = (lotsRef.current[key] || []).filter((bus) => bus && bus !== "X").length;
    if (!count) return;
    setEditingLot(null);
    setClearLotTarget({ key, label: LOT_LABELS[key], count });
  }

  async function confirmLotClear() {
    if (!clearLotTarget) return;
    await archiveCurrentLotSheet();
    const previous = [...(lotsRef.current[clearLotTarget.key] || [])];
    const value = clearLotTarget.key === "bay"
      ? previous.map((bus) => (bus === "X" ? "X" : ""))
      : [];
    offerLotUndo({
      key: clearLotTarget.key,
      label: `${clearLotTarget.label} cleared`,
      value: previous,
    });
    patchLots(
      { ...lotsRef.current, [clearLotTarget.key]: value },
      [],
      [clearLotTarget.key],
    );
  }

  function undoLotClear() {
    if (!undoLot) return;
    patchLots({ ...lotsRef.current, [undoLot.key]: [...undoLot.value] }, [undoLot.key]);
    setUndoLot(null);
    clearTimeout(undoTimer.current);
  }

  function locateLot(bus: string): string {
    for (const k of Object.keys(LOT_LABELS) as LotKey[]) {
      const idx = (lots[k] || []).indexOf(bus);
      if (idx === -1) continue;
      // Bays are positional, so say exactly which one ("Bay 3").
      return k === "bay" ? `${LOT_LABELS[k]} ${idx + 1}` : LOT_LABELS[k];
    }
    return "";
  }

  // The live search: the message is derived, so it stays up (and stays correct
  // as the lots change) until the box is cleared.
  const foundBus = findVal.length >= 4 ? findVal : "";
  const foundWhere = foundBus ? locateLot(foundBus) : "";
  const turnoverDate = [data.cells["date-m"], data.cells["date-d"], data.cells["date-y"]].filter(Boolean).join("/");
  function setTurnoverDate(value: string) {
    const [month = "", day = "", year = ""] = value.split("/");
    setData((current) => ({
      ...current,
      cells: { ...current.cells, "date-m": month, "date-d": day, "date-y": year },
    }));
  }

  // Pull a bus out of whichever lot it currently sits in so it can be added
  // elsewhere — powers the lot editor's "Move it here". BAY is positional
  // (10 fixed spots) so we blank the slot instead of removing it.
  function relocateBus(bus: string) {
    if (!bus) return;
    pendingClear.current.push(bus);
    const next = { ...lotsRef.current } as TurnoverLots;
    let changed = false;
    for (const k of Object.keys(next) as LotKey[]) {
      const arr = next[k] || [];
      if (!arr.includes(bus)) continue;
      next[k] =
        k === "bay"
          ? arr.map((b) => (b === bus ? "" : b)) // positional: blank the slot
          : arr.filter((b) => b !== bus);
      changed = true;
    }
    if (changed) {
      lotsRef.current = next;
      setLots(next);
    }
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
    <div className={chromeStyles.page}>
      <style dangerouslySetInnerHTML={{ __html: "@page { size: legal portrait; margin: 0; }" }} />

      <Toolbar className={`${chromeStyles.toolbar} no-print`}>
        <DatePickerField
          className={chromeStyles.date}
          value={turnoverDate}
          onValueChange={setTurnoverDate}
          shortYear
          ariaLabel="Turnover Sheet date"
          variant="ui"
        />
        <StaticChip tone="success">{fleet.readyForService.size} Usable</StaticChip>
        <StaticChip tone="warning">{fleet.notReadyForService.size} Out of Service</StaticChip>
        <StaticChip tone="accent">{fleet.inShop.size} in the shop</StaticChip>
        <ToolbarGroup className={chromeStyles.actions}>
          <ActionMenu
            label={<><MoreHorizontal size={16} /> More</>}
            items={[
              { id: "history", label: "Previous sheets", icon: <History size={16} /> },
              {
                id: "flags",
                label: printFlags ? "Print with flags: On" : "Print with flags: Off",
                icon: printFlags ? <Check size={16} /> : <span aria-hidden="true" />,
              },
              { id: "clear", label: "Clear sheet", icon: <Eraser size={16} />, tone: "danger" },
            ]}
            onAction={(key) => {
              if (key === "history") setPrevOpen(true);
              if (key === "flags") setPrintFlags((current) => !current);
              if (key === "clear") setClearOpen(true);
            }}
          />
          <Button variant="primary" onPress={printPdf}>
            <FileDown aria-hidden="true" /> Print PDF
          </Button>
        </ToolbarGroup>
      </Toolbar>

      <PaperViewport
        profile={LEGAL_PORTRAIT}
        mobileViewer
        label="Turnover Sheet paper preview"
        style={{ "--tfz": `${fontPx}px` } as CSSProperties}
      >
        <div
          className={`sheet turn-sheet ${!printFlags ? "turn-sheet--blank" : ""}`}
          data-paper-page=""
          data-paper-profile="legal-portrait"
          data-sheet-id="turnover"
          data-page-number="1"
        >
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
                <td colSpan={4}>HOLDS / NOTES</td>
              </tr>
              {Array.from({ length: BAY_ROWS }, (_, i) => {
                const n = i + 1;
                const bayBus = (lots.bay || [])[i] || "";
                const bayFlags = bayBus && bayBus !== "X" ? flagsFullDisplay(flags[bayBus]) : "";
                return (
                  <tr key={`bay-${n}`}>
                    <td />
                    <td className="turnt__c">
                      <input
                        className="turnt__in turnt__in--c"
                        inputMode="numeric"
                        value={bayBus}
                        onChange={(e) => setBayBus(i, e.target.value)}
                      />
                    </td>
                    <td colSpan={3}>
                      <div className="turnt__fline">
                        <span className="turnt__bayno">{n})</span>
                        {/* The bay bus's flags (auto, tap to edit) — the typed
                            text next to them stays free for extra notes. */}
                        {bayFlags && (
                          <button
                            type="button"
                            className="turnt__bayflag"
                            onClick={() => setFlagBus(bayBus)}
                            title="This bus's flags — tap to edit"
                          >
                            {bayFlags}
                          </button>
                        )}
                        <input
                          className="turnt__in turnt__in--fill turnt__flagentry"
                          value={bayBus && bayBus !== "X" ? data.cells[`bay1h-${n}`] || "" : ""}
                          disabled={!bayBus || bayBus === "X"}
                          placeholder={bayBus && bayBus !== "X" ? "Flag or note" : ""}
                          onChange={(event) => setCell(`bay1h-${n}`, event.target.value)}
                          onBlur={() => commitBayFirstHalf(bayBus, `bay1h-${n}`)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            event.currentTarget.blur();
                          }}
                        />
                      </div>
                    </td>
                    <td colSpan={4}>{E(`bay2h-${n}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SheetRevision sheetId="turnover" className="turnt__revision" />
        </div>
      </PaperViewport>

      {editingLot && !flagBus && (
        <LotEditor
          title={LOT_LABELS[editingLot] || editingLot}
          list={lots[editingLot] || []}
          flags={flags}
          locate={(bus) => locateLot(bus)}
          onRelocate={relocateBus}
          onEditFlags={(bus) => setFlagBus(bus)}
          onAdd={(bus) => addToLot(editingLot, bus)}
          onRemove={(i) => removeFromLot(editingLot, i)}
          onMove={(i, dir) => moveInLot(editingLot, i, dir)}
          onReorder={(from, to) => reorderInLot(editingLot, from, to)}
          onClearRequest={() => requestClearLot(editingLot)}
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

      <ConfirmDialog
        isOpen={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear the Turnover sheet?"
        description="The current sheet is saved to Previous Sheets first. Shared lots and bus flags are not cleared."
        confirmLabel="Clear sheet"
        tone="danger"
        onConfirm={clearAll}
      />

      <ConfirmDialog
        isOpen={clearLotTarget !== null}
        onOpenChange={(open) => {
          if (!open) setClearLotTarget(null);
        }}
        title={`Clear ${clearLotTarget?.label || "location"}?`}
        description={
          clearLotTarget
            ? `This removes ${clearLotTarget.count} bus${clearLotTarget.count === 1 ? "" : "es"} from ${clearLotTarget.label} for everyone. Other locations are not changed.`
            : ""
        }
        confirmLabel="Clear location"
        tone="danger"
        onConfirm={confirmLotClear}
      />

      {undoLot && (
        <div className={`${styles.toast} no-print`} role="status">
          <span>{undoLot.label}</span>
          <Button size="sm" onPress={undoLotClear}>Undo</Button>
        </div>
      )}

      {loaded && lotsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
