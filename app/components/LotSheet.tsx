"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
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
  DEPARTMENTS,
  flagName,
} from "../lib/grid";
import { LayoutGrid, Flag, FlagOff, Eraser, ListX, History, FileDown, Search, Share2, ListChecks, X } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import CellEditor from "./CellEditor";
import ManagerPanel from "./ManagerPanel";
import TypeCodes from "./TypeCodes";
import LotEditor from "./LotEditor";
import RowFill from "./RowFill";
import PrevSheets from "./PrevSheets";
import ToolMenu from "./ToolMenu";
import Overlay from "./Overlay";
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
  northlane: "North Lane", southlane: "South Lane", bay: "Bay", cards: "Cards",
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

// ---- drag-and-drop cells ----
// Top-level components (NOT defined inside LotSheet) so they keep their identity
// across re-renders — an inline component would remount mid-drag and break dnd.
// Every cell is a drop target; a cell with a bus is also draggable. Tap still
// opens the editor (mouse drags need ~6px of movement, touch a long-press).

interface GridCellProps {
  id: string | null;
  slotLabel: string | number | null;
  num: string;
  entry: FlagEntry | null;
  selected?: boolean;
  foundBus?: string; // the searched bus — steady highlight while it matches
  onOpen: (id: string, subLabel: string) => void;
}

function GridCell({ id, slotLabel, num, entry, selected, foundBus, onOpen }: GridCellProps) {
  const { label: busLabel } = useBusMaster();
  const blocked = slotLabel === "X"; // the form's own X (ROW 10) — not editable
  const xed = num === "X"; // user-blocked spot — tap to unblock via the editor
  const drag = useDraggable({ id: `cell:${id}`, data: { cellId: id, num }, disabled: !id || !num || xed });
  const drop = useDroppable({ id: `cell:${id}`, data: { cellId: id }, disabled: !id || xed });
  if (blocked) {
    return (
      <div className="cell cell--blocked">
        <span className="cell__x">X</span>
      </div>
    );
  }
  const found = !!foundBus && num === foundBus;
  const disp = entry ? flagDisplay(entry) : "";
  const miles = entry ? inspMilesDisplay(entry) : "";
  const pin = entry ? pinnedFlagText(entry) : "";
  return (
    <button
      type="button"
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-cellid={id ?? undefined}
      className={`cell ${num && !xed ? "cell--filled" : ""} ${xed ? "cell--blocked" : ""} ${
        drag.isDragging ? "cell--dragsrc" : ""
      } ${drop.isOver ? "cell--dropover" : ""} ${selected ? "cell--selected" : ""} ${found ? "cell--found" : ""}`}
      onClick={() => onOpen(id!, slotLabel != null ? `Slot ${slotLabel}` : "ROW 11")}
    >
      {slotLabel != null && <span className="cell__slot">{slotLabel}</span>}
      {xed ? (
        <span className="cell__x">X</span>
      ) : (
        <>
          {num && <TypeCodes num={num} className="cell__types" />}
          <span className="cell__num">{busLabel(num)}</span>
          {(disp || miles || pin) && (
            <span className="cell__meta">
              {disp && <span className="cell__flag">{disp}</span>}
              {miles && <span className="cell__insp">{miles}</span>}
              {pin && <span className="cell__pin">{pin}</span>}
            </span>
          )}
        </>
      )}
    </button>
  );
}

interface FrontCellProps {
  c: number;
  num: string;
  entry: FlagEntry | null;
  selected?: boolean;
  foundBus?: string;
  onOpen: (id: string, subLabel: string) => void;
}

function FrontCell({ c, num, entry, selected, foundBus, onOpen }: FrontCellProps) {
  const { label: busLabel } = useBusMaster();
  const id = frontCellId(c);
  const xed = num === "X";
  const drag = useDraggable({ id: `cell:${id}`, data: { cellId: id, num }, disabled: !num || xed });
  const drop = useDroppable({ id: `cell:${id}`, data: { cellId: id }, disabled: xed });
  const found = !!foundBus && num === foundBus;
  const disp = entry ? flagDisplay(entry) : "";
  const miles = entry ? inspMilesDisplay(entry) : "";
  const pin = entry ? pinnedFlagText(entry) : "";
  return (
    <button
      type="button"
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-cellid={id}
      className={`front ${num && !xed ? "front--filled" : ""} ${xed ? "cell--blocked" : ""} ${
        drag.isDragging ? "cell--dragsrc" : ""
      } ${drop.isOver ? "cell--dropover" : ""} ${selected ? "cell--selected" : ""} ${found ? "cell--found" : ""}`}
      onClick={() => onOpen(id, `ROW ${c + 1} — front bus`)}
    >
      {xed ? (
        <span className="cell__x">X</span>
      ) : (
        <>
          {num && <TypeCodes num={num} className="front__types" />}
          <span className="cell__num">{busLabel(num)}</span>
          {disp && <span className="front__flag">{disp}</span>}
          {miles && <span className="front__flag front__insp">{miles}</span>}
          {pin && <span className="front__flag front__pin">{pin}</span>}
        </>
      )}
    </button>
  );
}

// A back-of-sheet lot box that accepts a dragged bus (drops it at the end of
// that lot's list) and still opens the lot editor on tap.
function BackLotBox({ lotKey, found, onOpen, children }: { lotKey: string; found?: boolean; onOpen: () => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lot:${lotKey}`, data: { lotKey } });
  return (
    <div
      ref={setNodeRef}
      data-lotkey={lotKey}
      className={`backlot ${isOver ? "backlot--dropover" : ""} ${found ? "backlot--found" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {children}
    </div>
  );
}

export default function LotSheet() {
  const { label: busLabel, isKnown, buses: masterBuses } = useBusMaster();
  const [sheet, setSheet] = useState<LotSheetData>(emptySheet);
  const [loaded, setLoaded] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [editing, setEditing] = useState<{ id: string; subLabel: string; seed?: string } | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [flags, setFlags] = useState<FlagMap>({}); // bus number -> flag entry
  const [managerOpen, setManagerOpen] = useState(false);
  const [flagBus, setFlagBus] = useState<string | null>(null); // open the flag editor on this bus
  const [dragNum, setDragNum] = useState<string | null>(null); // bus being dragged (for the overlay chip)
  const [findVal, setFindVal] = useState(""); // toolbar "find bus" box
  const [undoState, setUndoState] = useState<{ label: string } | null>(null); // undo toast
  const undoSheetRef = useRef<LotSheetData | null>(null); // the sheet as it was before the change
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [recent, setRecent] = useState<string[]>([]); // buses recently taken off the sheet (quick re-add)
  const [selectMode, setSelectMode] = useState(false); // multi-select: tap buses, act on all at once
  const [selected, setSelected] = useState<string[]>([]); // selected cell ids
  const [missingOpen, setMissingOpen] = useState(false); // "which buses are missing" list
  const [flagPick, setFlagPick] = useState<"add" | "remove" | null>(null); // bulk flag picker for the selection
  const suppressClickUntil = useRef(0); // swallow the click that follows a drag
  // Mouse: a drag starts after 6px of movement, so plain clicks still open the
  // editor. Touch: a short hold starts the drag, so normal taps and scrolling
  // keep working.
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );
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

  // The sheet text runs +2px over the base sizes (the old adjustable "Sheet
  // Settings" stepper is gone — everyone gets the standard size).
  const FONT_BASE = 2;

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

  // ---- undo (one step, for the bigger actions) ----
  // Snapshot the sheet BEFORE a change and offer to put it back for a few
  // seconds. The snapshot is the previous immutable state object, so this is
  // cheap and exact; undoing autosaves like any other edit.
  function offerUndo(label: string) {
    undoSheetRef.current = sheetRef.current;
    setUndoState({ label });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoState(null), 6000);
  }
  function undoNow() {
    if (undoSheetRef.current) setSheet(undoSheetRef.current);
    undoSheetRef.current = null;
    setUndoState(null);
    clearTimeout(undoTimer.current);
  }
  // Same toast, no Undo — for confirmations like "Copied to clipboard".
  function showNotice(label: string) {
    undoSheetRef.current = null;
    setUndoState({ label });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoState(null), 3000);
  }

  // Remember buses that just left the sheet so the lot editors can offer them
  // as one-tap chips (newest first, capped, session-only).
  function noteRemoved(bus: string) {
    if (!bus) return;
    setRecent((r) => [bus, ...r.filter((b) => b !== bus)].slice(0, 8));
  }

  function saveNum(id: string, num: string) {
    const prev = getNum(id);
    if (prev && prev !== num) noteRemoved(prev);
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
    offerUndo("Grid cleared");
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
    offerUndo("Lots cleared");
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
    // A drag fires a click on the source cell when it ends — don't open the editor for it.
    if (Date.now() < suppressClickUntil.current) return;
    // Select mode: taps toggle the bus in/out of the selection instead.
    if (selectMode) {
      const n = getNum(id);
      if (!n || n === "X") return; // only buses can be selected (not blocked spots)
      setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
      return;
    }
    setEditing({ id, subLabel });
  }

  // ---- multi-select bulk actions ----
  function exitSelectMode() {
    setSelectMode(false);
    setSelected([]);
  }
  function bulkSendToLot(key: string) {
    const ids = selected.filter((id) => {
      const n = getNum(id);
      return n && n !== "X";
    });
    if (!ids.length) return;
    offerUndo(`${ids.length} bus${ids.length === 1 ? "" : "es"} → ${LOT_LOCATION_LABELS[key] || key}`);
    setSheet((s) => {
      const cells = { ...s.cells };
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = [...(lots[key as LotKey] || [])];
      for (const id of ids) {
        const bus = cellToNum(cells[id]);
        if (bus && !arr.includes(bus)) arr.push(bus);
        delete cells[id];
      }
      return { ...s, cells, lots: { ...lots, [key]: arr } };
    });
    exitSelectMode();
  }
  function bulkClearCells() {
    const ids = selected.filter((id) => {
      const n = getNum(id);
      return n && n !== "X";
    });
    if (!ids.length) return;
    offerUndo(`Cleared ${ids.length} bus${ids.length === 1 ? "" : "es"}`);
    for (const id of ids) noteRemoved(getNum(id));
    setSheet((s) => {
      const cells = { ...s.cells };
      for (const id of ids) delete cells[id];
      return { ...s, cells };
    });
    exitSelectMode();
  }
  // Save a bus's flag entry (server + local state), same as the flag editor does.
  function postFlagEntry(bus: string, entry: FlagEntry) {
    fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bus,
        flags: entry.flags,
        note: entry.note,
        inspMiles: entry.inspMiles ?? null,
        holdReason: entry.holdReason ?? "",
        retorqueTires: entry.retorqueTires || [],
        inspOption: entry.inspOption ?? "",
      }),
    }).catch(() => {});
    onBusFlagsUpdated(bus, entry);
  }
  // Add/remove one flag on EVERY selected bus at once.
  function bulkFlag(flagId: string) {
    const action = flagPick;
    setFlagPick(null);
    if (!action) return;
    const buses = Array.from(new Set(selected.map((id) => getNum(id)).filter((b) => b && b !== "X")));
    if (!buses.length) return;
    for (const bus of buses) {
      const cur: FlagEntry = flags[bus] || { ...EMPTY_FLAG };
      if (action === "add") {
        if (cur.flags.includes(flagId)) continue;
        postFlagEntry(bus, { ...cur, flags: [...cur.flags, flagId] });
      } else {
        if (!cur.flags.includes(flagId)) continue;
        const patch: FlagEntry = { ...cur, flags: cur.flags.filter((f) => f !== flagId) };
        if (flagId === "inspection") patch.inspOption = "";
        if (flagId === "retorque") patch.retorqueTires = [];
        if (flagId === "hold") patch.holdReason = "";
        postFlagEntry(bus, patch);
      }
    }
    showNotice(
      `${flagName(flagId)} ${action === "add" ? "added to" : "removed from"} ${buses.length} bus${buses.length === 1 ? "" : "es"}`
    );
    exitSelectMode();
  }

  // ---- keyboard power mode (spreadsheet feel, desktop) ----
  // Move focus to the nearest cell in a direction, judged geometrically from the
  // rendered layout — works across the front row, the grid, and ROW 11.
  function moveCellFocus(fromEl: HTMLElement, dir: "left" | "right" | "up" | "down") {
    const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-cellid]"));
    const r = fromEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const horiz = dir === "left" || dir === "right";
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of cells) {
      if (el === fromEl) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const primary = horiz ? (dir === "left" ? -dx : dx) : dir === "up" ? -dy : dy;
      const cross = horiz ? Math.abs(dy) : Math.abs(dx);
      if (primary < 2) continue; // must actually lie in that direction
      if (cross > (horiz ? r.height : r.width) * 0.9) continue; // stay in the same row/column
      const score = primary + cross * 4;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    best?.focus();
  }

  // On a focused cell: arrows move, a digit starts typing the bus right away,
  // Backspace/Delete clears the cell, Escape drops out of keyboard mode.
  function onSheetKeyDown(e: React.KeyboardEvent) {
    const el = e.target as HTMLElement;
    const cellId = el.getAttribute ? el.getAttribute("data-cellid") : null;
    if (!cellId) return;
    const key = e.key;
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      moveCellFocus(el, key === "ArrowLeft" ? "left" : key === "ArrowRight" ? "right" : key === "ArrowUp" ? "up" : "down");
    } else if (/^\d$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setEditing({ id: cellId, subLabel: cellLocationLabel(cellId), seed: key });
    } else if (key === "Backspace" || key === "Delete") {
      e.preventDefault();
      saveNum(cellId, "");
    } else if (key === "Escape") {
      el.blur();
    }
  }

  // ---- drag-and-drop ----
  function onDragStart(e: DragStartEvent) {
    setDragNum((e.active.data.current?.num as string) || null);
  }
  function onDragCancel() {
    setDragNum(null);
    suppressClickUntil.current = Date.now() + 300;
  }
  // Drop on a cell: empty = move, occupied = swap the two buses.
  // Drop on a back-of-sheet lot box: leave the grid and join that lot's list.
  function onDragEnd(e: DragEndEvent) {
    setDragNum(null);
    suppressClickUntil.current = Date.now() + 300;
    const from = e.active.data.current?.cellId as string | undefined;
    const num = e.active.data.current?.num as string | undefined;
    if (!from || !num || !e.over) return;
    const overData = e.over.data.current as { cellId?: string; lotKey?: string } | undefined;
    if (overData?.cellId) {
      const to = overData.cellId;
      if (to === from) return;
      const displacedNow = cellToNum(sheet.cells[to]);
      offerUndo(displacedNow ? `Swapped ${num} ↔ ${displacedNow}` : `Moved ${num}`);
      setSheet((s) => {
        const cells = { ...s.cells };
        const displaced = cellToNum(cells[to]);
        cells[to] = num;
        if (displaced) cells[from] = displaced; // swap
        else delete cells[from]; // move
        return { ...s, cells };
      });
    } else if (overData?.lotKey) {
      const key = overData.lotKey as LotKey;
      offerUndo(`${num} → ${LOT_LOCATION_LABELS[key] || key}`);
      setSheet((s) => {
        const cells = { ...s.cells };
        delete cells[from];
        const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
        const arr = lots[key] || [];
        return { ...s, cells, lots: { ...lots, [key]: arr.includes(num) ? arr : [...arr, num] } };
      });
    }
  }

  // "Send to…" from the cell editor: take the bus out of its cell and append it
  // to the chosen back-of-sheet lot — no dragging across the page needed.
  function sendCellBusToLot(cellId: string, bus: string, key: string) {
    offerUndo(`${bus} → ${LOT_LOCATION_LABELS[key] || key}`);
    setSheet((s) => {
      const cells = { ...s.cells };
      delete cells[cellId];
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = lots[key as LotKey] || [];
      return { ...s, cells, lots: { ...lots, [key]: arr.includes(bus) ? arr : [...arr, bus] } };
    });
    setEditing(null);
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
    const removed = (sheet.lots?.[key as LotKey] || [])[index];
    if (removed) noteRemoved(removed);
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
  // Drag-to-reorder inside a lot list: lift the bus at `from` and drop it at `to`.
  function reorderInLot(key: string, from: number, to: number) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = [...(lots[key as LotKey] || [])];
      if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return s;
      const [bus] = arr.splice(from, 1);
      arr.splice(to, 0, bus);
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
      if (!Array.isArray(arr)) continue;
      const idx = arr.indexOf(num);
      if (idx === -1) continue;
      const label = LOT_LOCATION_LABELS[key] || key;
      // Positional lots say exactly which spot ("Bay 3", "Card 5").
      return key === "bay" || key === "cards" ? `${label} ${idx + 1}` : label;
    }
    return "";
  }

  // Toolbar "find bus": scroll to the bus and flash it. The message + steady
  // highlight are DERIVED from the search text, so they stay up (and stay
  // correct as the sheet changes) until the search is cleared.
  function findBus(raw?: string) {
    const v = sanitizeBus(raw ?? findVal);
    if (v.length < 4) return;
    const where = locateBus(v, null);
    if (!where) return;
    const flash = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("is-found");
      setTimeout(() => el.classList.remove("is-found"), 2200);
      return true;
    };
    // A grid cell? (front row + ROW 11 included — they're all in sheet.cells.)
    for (const [id, cv] of Object.entries(sheet.cells || {})) {
      if (cellToNum(cv) === v) {
        flash(`[data-cellid="${id}"]`);
        return;
      }
    }
    // A back-of-sheet lot box on this page (Turnover-managed lots have no box
    // here — the message alone covers those).
    const lots = sheet.lots || {};
    for (const [key, arr] of Object.entries(lots)) {
      if (Array.isArray(arr) && arr.includes(v)) {
        flash(`[data-lotkey="${key}"]`);
        return;
      }
    }
  }

  // Pull a bus out of wherever it currently sits (any grid cell or any lot) so
  // it can be dropped into a new spot — powers the editors' "Move it here".
  // BAY is positional (10 fixed spots) so we blank the slot instead of removing it.
  function relocateBus(num: string) {
    if (!num) return;
    offerUndo(`Moved ${num}`);
    setSheet((s) => {
      const cells = { ...s.cells };
      for (const [id, v] of Object.entries(cells)) {
        if (cellToNum(v) === num) delete cells[id];
      }
      const lots: Lots = { ...(s.lots || {}) };
      for (const k of Object.keys(lots) as LotKey[]) {
        const arr = lots[k];
        if (!Array.isArray(arr) || !arr.includes(num)) continue;
        lots[k] =
          k === "bay" || k === "cards"
            ? arr.map((b) => (b === num ? "" : b)) // positional: blank the slot
            : arr.filter((b) => b !== num);
      }
      return { ...s, cells, lots };
    });
  }

  // A cell's current bus + flag entry, for the top-level GridCell/FrontCell.
  function cellProps(id: string) {
    const num = getNum(id);
    return { num, entry: num ? flagFor(num) : null };
  }

  // Buses with flags, grouped by most-severe flag, for the back-of-sheet summary.
  const flagSummary = groupFlaggedBuses(flags);

  // Where each bus currently sits on the grid (bus number -> "Row 5 · #85").
  const busLocations: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(sheet.cells || {})) {
    const n = cellToNum(v);
    if (!n || n === "X") continue;
    const loc = cellLocationLabel(id);
    if (loc) (busLocations[n] = busLocations[n] || []).push(loc);
  }

  // "# OF VEHICLES OFF PROPERTY" is auto-counted from the OFF PROPERTY flag.
  const offPropertyCount = Object.values(flags).filter((e) =>
    (e.flags || []).includes("offprop")
  ).length;

  // "# OF VEHICLES IN SHOP" is auto-counted too: everything on the Shop page
  // (Apron + Bays + Cards) plus any bus flagged IN SHOP.
  const inShopSet = new Set<string>();
  for (const k of ["apron", "bay", "cards"] as const) {
    for (const b of sheet.lots?.[k] || []) if (b && b !== "X") inShopSet.add(b);
  }
  for (const [bus, e] of Object.entries(flags)) {
    if ((e.flags || []).includes("shop")) inShopSet.add(bus);
  }
  const inShopCount = inShopSet.size;

  // The live search: message + steady highlight persist until the box clears.
  const foundBus = findVal.length >= 4 ? findVal : "";
  const foundWhere = foundBus ? locateBus(foundBus, null) : "";

  // Quick stats for the toolbar chip ("X" = a blocked spot, not a bus).
  const onGridCount = Object.values(sheet.cells || {}).filter((v) => {
    const n = cellToNum(v);
    return n && n !== "X";
  }).length;
  const inLotsCount = Object.values(sheet.lots || {}).reduce(
    (n: number, arr) => n + (Array.isArray(arr) ? arr.filter((b) => b && b !== "X").length : 0),
    0
  );
  // Missing = ACTIVE buses on the roster that aren't anywhere on the sheet
  // (no grid cell and no lot). A bus flagged OFF PROPERTY or IN SHOP is
  // accounted for — listed for reference, but it doesn't count as missing.
  const placedBuses = new Set<string>();
  for (const v of Object.values(sheet.cells || {})) {
    const n = cellToNum(v);
    if (n) placedBuses.add(n);
  }
  for (const arr of Object.values(sheet.lots || {})) {
    if (Array.isArray(arr)) for (const b of arr) if (b) placedBuses.add(b);
  }
  const notPlaced = masterBuses
    .filter((b) => b.status !== "retired" && !placedBuses.has(b.num))
    .map((b) => b.num)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const isAccountedFor = (bus: string) => {
    const f = flags[bus]?.flags || [];
    return f.includes("offprop") || f.includes("shop");
  };
  const missingBuses = notPlaced.filter((b) => !isAccountedFor(b));
  const accountedBuses = notPlaced.filter(isAccountedFor);

  // The whole sheet as clean text — for pasting into a group chat at handoff.
  function buildShareText(): string {
    const lines: string[] = [];
    lines.push(`PACE LOT SHEET — ${[sheet.date, sheet.time].filter(Boolean).join(" ")}`);
    lines.push(
      `On grid: ${onGridCount} · In lots: ${inLotsCount} · Off property: ${offPropertyCount}` +
        (sheet.inShop ? ` · In shop: ${sheet.inShop}` : "")
    );
    const gridEntries = Object.entries(sheet.cells || {})
      .map(([id, v]) => ({ loc: cellLocationLabel(id), bus: cellToNum(v) }))
      .filter((e) => e.bus && e.bus !== "X" && e.loc)
      .sort((a, b) => a.loc.localeCompare(b.loc, undefined, { numeric: true }));
    if (gridEntries.length) {
      lines.push("", "GRID:");
      for (const e of gridEntries) lines.push(`${e.loc}: ${busLabel(e.bus)}`);
    }
    for (const [key, arr] of Object.entries(sheet.lots || {})) {
      const buses = (Array.isArray(arr) ? arr : []).filter((b) => b && b !== "X");
      if (!buses.length) continue;
      lines.push("", `${(LOT_LOCATION_LABELS[key] || key).toUpperCase()} (${buses.length}): ${buses.map((b) => busLabel(b)).join(", ")}`);
    }
    if (flagSummary.length) {
      lines.push("", "FLAGS:");
      for (const g of flagSummary)
        for (const bus of g.buses) lines.push(`${busLabel(bus)}: ${flagsFullDisplay(flagFor(bus))}`);
    }
    return lines.join("\n");
  }

  // Native share sheet where available (straight into a group chat); clipboard
  // fallback elsewhere.
  async function shareSheet() {
    const text = buildShareText();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
      } catch {
        /* user closed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showNotice("Copied to clipboard");
    } catch {
      showNotice("Couldn't copy — try again");
    }
  }

  return (
    <div className="app">
      {/* Toolbar — never printed */}
      <div className="toolbar no-print">
        <div className="toolbar__title">Lot Sheet</div>
        <div className="findbox" title="Type a bus number to jump to it on the sheet">
          <Search size={15} />
          <input
            className="findbox__in"
            placeholder="Find bus"
            inputMode="numeric"
            value={findVal}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const v = sanitizeBus(e.target.value);
              setFindVal(v);
              if (isKnown(v)) findBus(v);
            }}
            onKeyDown={(e) => e.key === "Enter" && findBus()}
          />
          {foundBus && <span className="findbox__msg">{foundWhere || "Not on the sheet"}</span>}
          {findVal && (
            <button className="findbox__clear" onClick={() => setFindVal("")} aria-label="Clear search" title="Clear">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="toolbar__spacer" />
        <button
          className={`statchip ${missingBuses.length ? "statchip--warn" : ""}`}
          onClick={() => setMissingOpen(true)}
          title="Tap to see which buses are missing from the sheet"
        >
          {onGridCount} on grid · {inLotsCount} in lots · {missingBuses.length} missing
        </button>
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "—"}
        </span>
        <button className="btn btn--primary" onClick={() => setFillOpen(true)}>
          <LayoutGrid size={16} /> Fill Rows
        </button>
        <button className="btn" onClick={() => setManagerOpen(true)}>
          <Flag size={16} /> Edit Flags
        </button>
        <button
          className={`btn ${selectMode ? "btn--primary" : ""}`}
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          title="Select several buses, then send or clear them all at once"
        >
          <ListChecks size={16} /> Select
        </button>
        <ToolMenu>
          <button className="toolmenu__item" onClick={() => setPrevOpen(true)}>
            <History size={16} /> Prev Sheets
          </button>
          <button className="toolmenu__item" onClick={shareSheet} title="Share the sheet as text (for a group chat)">
            <Share2 size={16} /> Share as text
          </button>
          <div className="toolmenu__sep" />
          <button className="toolmenu__item toolmenu__item--danger" onClick={newSheet}>
            <Eraser size={16} /> Clear Grid
          </button>
          <button className="toolmenu__item toolmenu__item--danger" onClick={clearLots}>
            <ListX size={16} /> Clear Lots
          </button>
          <div className="toolmenu__sep" />
          <label
            className="toolmenu__item"
            onClick={(e) => e.stopPropagation()}
            title="Include the bus type codes and maintenance flags on the printout"
          >
            <input
              type="checkbox"
              checked={showMaint}
              onChange={(e) => setShowMaint(e.target.checked)}
            />
            Maintenance info
          </label>
        </ToolMenu>
        <button className="btn btn--primary" onClick={openPdf} title="Generate a Letter-size PDF and open the print dialog">
          <FileDown size={16} /> Print PDF
        </button>
      </div>

      {/* The printable sheet */}
      <DndContext sensors={dndSensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div className="sheet-scroll" style={{ "--fz": `${FONT_BASE}px` } as CSSProperties}>
        <div className={`sheet ${showMaint ? "sheet--maint" : ""}`} onKeyDown={onSheetKeyDown}>
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
                className="counter__auto"
                value={inShopCount}
                readOnly
                title="Auto-counted from the Shop page (Apron, Bays, Cards) plus buses flagged IN SHOP"
              />
            </div>
          </div>

          {/* Front-bus row — open whitespace ABOVE the ROW bar, ROW 1..6 only */}
          <div className="frontrow">
            {Array.from({ length: COLUMN_COUNT }).map((_, c) => {
              if (c >= FRONT_COLUMNS) return <div key={`f${c}`} className="front front--empty" />;
              return (
                <FrontCell
                  key={`f${c}`}
                  c={c}
                  {...cellProps(frontCellId(c))}
                  selected={selected.includes(frontCellId(c))}
                  foundBus={foundBus}
                  onOpen={openCell}
                />
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
                  const id = row11CellId(b);
                  return (
                    <GridCell key={`b${b}c${c}`} id={id} slotLabel={null} {...cellProps(id)} selected={selected.includes(id)} foundBus={foundBus} onOpen={openCell} />
                  );
                }
                if (slot === "X") {
                  return <GridCell key={`b${b}c${c}`} id={null} slotLabel="X" num="" entry={null} onOpen={openCell} />;
                }
                const id = numberedCellId(slot as number);
                return (
                  <GridCell key={`b${b}c${c}`} id={id} slotLabel={slot} {...cellProps(id)} selected={selected.includes(id)} foundBus={foundBus} onOpen={openCell} />
                );
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
              <BackLotBox
                key={lot.key}
                lotKey={lot.key}
                found={!!foundBus && lotList(lot.key).includes(foundBus)}
                onOpen={() => setEditingLot(lot.key)}
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
              </BackLotBox>
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

      {/* The bus chip that follows the pointer while dragging */}
      <DragOverlay dropAnimation={null}>
        {dragNum ? (
          <div className="dragchip">
            <TypeCodes num={dragNum} />
            {busLabel(dragNum)}
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {/* Signals the headless PDF renderer that the sheet + flags have loaded. */}
      {loaded && flagsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}

      {editing && (
        <CellEditor
          subLabel={editing.subLabel}
          value={editing.seed != null ? editing.seed : getNum(editing.id)}
          flags={flags}
          cellId={editing.id}
          locate={locateBus}
          onRelocate={relocateBus}
          blockable
          sendTargets={LOTS.map((l) => ({ key: l.key, label: LOT_LOCATION_LABELS[l.key] || l.title }))}
          onSendToLot={(bus, key) => sendCellBusToLot(editing.id, bus, key)}
          onEditFlags={(bus) => {
            setEditing(null);
            setFlagBus(bus);
          }}
          onSave={(num) => {
            const id = editing.id;
            saveNum(id, num);
            setEditing(null);
            // Keyboard flow: put focus back on the cell so arrows keep working.
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>(`[data-cellid="${id}"]`)?.focus({ preventScroll: true })
            );
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

      {/* Which active buses aren't anywhere on the sheet (tap the stats chip) */}
      {missingOpen && (
        <Overlay
          onClose={() => setMissingOpen(false)}
          overlayClassName="modal-backdrop no-print"
          contentClassName="modal modal--tall"
          label="Missing buses"
        >
          <div className="modal__head">
            <div>
              <div className="modal__title">Missing buses</div>
              <div className="modal__sub">
                {missingBuses.length
                  ? `${missingBuses.length} active bus${missingBuses.length === 1 ? "" : "es"} unaccounted for.`
                  : "Every active bus is accounted for."}
                {accountedBuses.length
                  ? ` ${accountedBuses.length} off property / in shop.`
                  : ""}
              </div>
            </div>
            <button className="modal__close" onClick={() => setMissingOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="lotlist">
            {[...missingBuses, ...accountedBuses].map((bus, i) => {
              const fdisp = flagsFullDisplay(flagFor(bus));
              const firstAccounted = i === missingBuses.length && accountedBuses.length > 0;
              return (
                <div key={bus}>
                  {firstAccounted && (
                    <div className="lotlist__section">Off property / in shop (not missing)</div>
                  )}
                  <div className="lotitem">
                    <div className="lotitem__info">
                      <span className="lotitem__bus">{busLabel(bus)}</span>
                      <TypeCodes num={bus} />
                      {fdisp && <span className="lotitem__flag">{fdisp}</span>}
                    </div>
                    <div className="lotitem__actions">
                      <button
                        className="lotitem__move"
                        onClick={() => {
                          setMissingOpen(false);
                          setFlagBus(bus);
                        }}
                        aria-label="Edit flags"
                        title="Edit this bus's flags"
                      >
                        <Flag size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="modal__actions">
            <div className="toolbar__spacer" />
            <button className="btn btn--primary" onClick={() => setMissingOpen(false)}>
              Done
            </button>
          </div>
        </Overlay>
      )}

      {editingLot && (
        <LotEditor
          title={LOTS.find((l) => l.key === editingLot)?.title || ""}
          list={lotList(editingLot)}
          flags={flags}
          locate={locateBus}
          onRelocate={relocateBus}
          recent={recent.filter((b) => !locateBus(b, null))}
          onEditFlags={(bus) => setFlagBus(bus)}
          onAdd={(bus) => addToLot(editingLot, bus)}
          onRemove={(i) => removeFromLot(editingLot, i)}
          onMove={(i, dir) => moveInLot(editingLot, i, dir)}
          onReorder={(from, to) => reorderInLot(editingLot, from, to)}
          onClose={() => setEditingLot(null)}
        />
      )}

      {/* Flag editor opened straight from a bus (grid cell or lot row) */}
      {flagBus && (
        <ManagerPanel
          flags={flags}
          initialBus={flagBus}
          onBusFlagsUpdated={onBusFlagsUpdated}
          onClose={() => setFlagBus(null)}
        />
      )}

      {/* Multi-select action bar: tap buses on the grid, then act on all of them */}
      {selectMode && (
        <div className="selectbar no-print">
          <span className="selectbar__count">
            {selected.length ? `${selected.length} selected` : "Tap buses to select"}
          </span>
          {LOTS.map((l) => (
            <button
              key={l.key}
              className="btn btn--mini"
              disabled={!selected.length}
              onClick={() => bulkSendToLot(l.key)}
            >
              → {LOT_LOCATION_LABELS[l.key] || l.title}
            </button>
          ))}
          <button className="btn btn--mini" disabled={!selected.length} onClick={() => setFlagPick("add")}>
            <Flag size={14} /> Add flag
          </button>
          <button className="btn btn--mini" disabled={!selected.length} onClick={() => setFlagPick("remove")}>
            <FlagOff size={14} /> Remove flag
          </button>
          <button className="btn btn--mini btn--ghost" disabled={!selected.length} onClick={bulkClearCells}>
            Clear
          </button>
          <button className="btn btn--mini" onClick={exitSelectMode}>
            Done
          </button>
        </div>
      )}

      {/* Which flag to add to / remove from every selected bus */}
      {flagPick && (
        <Overlay
          onClose={() => setFlagPick(null)}
          overlayClassName="modal-backdrop no-print"
          contentClassName="modal modal--tall"
          label={flagPick === "add" ? "Add a flag" : "Remove a flag"}
        >
          <div className="modal__head">
            <div>
              <div className="modal__title">{flagPick === "add" ? "Add a flag" : "Remove a flag"}</div>
              <div className="modal__sub">
                {flagPick === "add"
                  ? `Applies to all ${selected.length} selected bus${selected.length === 1 ? "" : "es"}.`
                  : `Removed from all ${selected.length} selected bus${selected.length === 1 ? "" : "es"}.`}
                {flagPick === "add" ? " (Retorque needs tires — set it per bus in Edit Flags.)" : ""}
              </div>
            </div>
            <button className="modal__close" onClick={() => setFlagPick(null)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="lotlist">
            {(() => {
              const seen = new Set<string>();
              return DEPARTMENTS.map((dept) => {
                const ids = dept.flags.filter((id) => {
                  if (seen.has(id)) return false;
                  if (flagPick === "add" && id === "retorque") return false;
                  seen.add(id);
                  return true;
                });
                if (!ids.length) return null;
                return (
                  <div className="busedit__dept" key={dept.id}>
                    <div className={`busedit__depthead busedit__depthead--${dept.id}`}>
                      <span className="busedit__dot" />
                      {dept.label}
                    </div>
                    <div className="busedit__chips">
                      {ids.map((id) => (
                        <button key={id} className="deptchip" onClick={() => bulkFlag(id)}>
                          {flagName(id)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          <div className="modal__actions">
            <div className="toolbar__spacer" />
            <button className="btn" onClick={() => setFlagPick(null)}>
              Cancel
            </button>
          </div>
        </Overlay>
      )}

      {/* Undo toast for the bigger actions (clears, drags, sends); plain notices reuse it */}
      {undoState && (
        <div className="toast no-print" role="status">
          <span>{undoState.label}</span>
          {undoSheetRef.current && (
            <button className="toast__btn" onClick={undoNow}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
