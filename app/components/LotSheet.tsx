"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
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
  flagsFullDisplay,
  groupFlaggedBuses,
  cellLocationLabel,
  departmentGroups,
  flagName,
} from "../lib/grid";
import { LayoutGrid, Flag, FlagOff, Eraser, ListX, History, FileDown, Share2, ListChecks, Ban, Lock, Wrench, Plus, MoreHorizontal, Check } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import dynamic from "next/dynamic";
import { GridCell, FrontCell, BackLotBox } from "./LotGridCells";
import CellEditor from "./CellEditor";
import ManagerPanel from "./ManagerPanelLazy";
import TypeCodes from "./TypeCodes";
import LotEditor from "./LotEditorLazy";
// Tap-to-open overlays load on first use, not with the page. CellEditor stays
// eager — tapping a cell is the hot path and must never wait on a chunk fetch.
const RowFill = dynamic(() => import("./RowFill"), { ssr: false });
const PrevSheets = dynamic(() => import("./PrevSheets"), { ssr: false });
import ShopMenu from "./ShopMenu";
import { MissingBusesModal, ServiceDetailModal } from "./LotStatusModals";
import DatePickerField from "./DatePickerField";
import MobileLotChrome from "./MobileLotChrome";
import { useMobileNav } from "./MobileNavContext";
import { chicagoLotStamp } from "../lib/chicagoTime";
import { getDeviceActor } from "../lib/deviceActor";
import { mergeLotSheet } from "../lib/lotSheetMerge";
import { applyLotSheetOp, diffLotSheetOps, type LotSheetOp, type LotSheetOpRecord } from "../lib/lotSheetOps";
import {
  applyOperationPage,
  createPendingBatch,
  parsePendingBatch,
  type LotSheetPendingBatch,
} from "../lib/syncCore";
import { fleetBusLocations, fleetStats } from "../lib/fleetStats";
import type { FlagEntry, FlagMap, LotKey, Lots, LotSheet as LotSheetData } from "../lib/types";
import { useFlags } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { ActionMenu, Button, Chip, ConfirmDialog, ResponsiveDialog, SplitButton, Toolbar, ToolbarGroup } from "../ui";
import chromeStyles from "./LotSheetChrome.module.css";

const STORAGE_KEY = "lotsheet:current";
const OUTBOX_KEY = "lotsheet:outbox:v1";
const BAY_SPOTS = 10; // the shop's fixed bays (shared with the Turnover sheet)

// Back-of-sheet ordered lists.
const LOTS: { key: LotKey; title: string }[] = [
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
type ClearTarget =
  | { kind: "grid" }
  | { kind: "lots" }
  | { kind: "location"; key: LotKey; label: string; count: number };

const EMPTY_FLAG: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };

// Tolerate the old { num, color, status } cell shape from earlier saved sheets.
function cellToNum(v: unknown): string {
  if (!v) return "";
  return typeof v === "string" ? v : (v as { num?: string }).num || "";
}

function emptySheet(): LotSheetData {
  return {
    time: "",
    date: "",
    timeOverride: false,
    dateOverride: false,
    offProperty: "",
    inShop: "",
    cells: {}, // id -> bus number string
    lots: { north: [], east: [], fence: [] }, // back-of-sheet ordered lists
    locks: [], // cell ids whose bus survives "Clear Grid"
  };
}

function blankPrintSheet(): LotSheetData {
  return {
    time: "",
    date: "",
    timeOverride: false,
    dateOverride: false,
    offProperty: "",
    inShop: "",
    cells: {},
    lots: { north: [], east: [], fence: [] },
    locks: [],
  };
}

function printStamp(now = new Date()) {
  return chicagoLotStamp(now);
}

// Read a query param on the very first render (used by the server-side PDF,
// which loads this page at /?print=1&maint=1 with a headless browser).
function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function LotSheet() {
  const { registerLotActions, setLotStatus } = useMobileNav();
  const { label: busLabel, isKnown, buses: masterBuses } = useBusMaster();
  const [sheet, setSheet] = useState<LotSheetData>(emptySheet);
  const [loaded, setLoaded] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [editing, setEditing] = useState<{ id: string; subLabel: string; seed?: string } | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState(false);
  // Bus flags come from the shared live cache (TanStack Query) — the /api/live
  // long-poll invalidates ["flags"] within ~1s of any write on any device, so an
  // already-open Lot Sheet reflects a flag changed elsewhere without a reload.
  // "Ready" includes the ERROR state: if /api/flags is down, render with empty
  // flags (like the old fetch().finally() did) instead of holding the PDF
  // renderer's #print-ready marker hostage forever.
  const { data: flags = {}, isSuccess: flagsOk, isError: flagsFailed } = useFlags();
  const flagsReady = flagsOk || flagsFailed;
  const qc = useQueryClient();
  const [managerOpen, setManagerOpen] = useState(false);
  const [flagBus, setFlagBus] = useState<string | null>(null); // open the flag editor on this bus
  const [dragNum, setDragNum] = useState<string | null>(null); // bus being dragged (for the overlay chip)
  const [findVal, setFindVal] = useState(""); // toolbar "find bus" box
  const findBusRef = useRef<(value?: string) => void>(undefined);
  const [undoState, setUndoState] = useState<{ label: string } | null>(null); // undo toast
  const undoSheetRef = useRef<LotSheetData | null>(null); // the sheet as it was before the change
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [recent, setRecent] = useState<string[]>([]); // buses recently taken off the sheet (quick re-add)
  const [selectMode, setSelectMode] = useState(false); // multi-select: tap buses, act on all at once
  const [selected, setSelected] = useState<string[]>([]); // selected cell ids
  const [missingOpen, setMissingOpen] = useState(false); // "which buses are missing" list
  const [serviceDetail, setServiceDetail] = useState<"usable" | "outOfService" | null>(null); // service-readiness list w/ where + why
  const [flagPick, setFlagPick] = useState<"add" | "remove" | null>(null); // bulk flag picker for the selection
  const [shopOpen, setShopOpen] = useState(false); // the Shop menu (edit Apron/Bays/Cards from here)
  const [editingBay, setEditingBay] = useState<number | null>(null); // bay slot editor (from the Shop menu)
  const [confirmClear, setConfirmClear] = useState<ClearTarget | null>(null);
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
  const [printedAt, setPrintedAt] = useState(() => printStamp());
  const [clockStamp, setClockStamp] = useState(() => printStamp());
  const [nativePrinting, setNativePrinting] = useState(false);
  const [blankPrintMode, setBlankPrintMode] = useState(false);
  // Gates the PDF renderer's #print-ready marker + the prewarm. A blank print has
  // no flags to wait for; otherwise it's ready once the flags query resolves.
  const flagsLoaded = blankPrintMode || flagsReady;

  // Read the print query params on the client (not during SSR/prerender, where
  // window doesn't exist — a lazy initializer would bake in the wrong value).
  useEffect(() => {
    if (param("print") === "1") {
      setPrintMode(true);
      setPrintedAt(printStamp());
    }
    if (param("blank") === "1") setBlankPrintMode(true);
    if (param("maint") === "1") setShowMaint(true);
    if (param("fill") === "1") setFillOpen(true);
    const find = sanitizeBus(param("find") || "");
    if (find) setFindVal(find);
  }, []);

  useEffect(() => {
    if (!loaded || !printMode) return;
    const timeOverride = param("timeOverride");
    const dateOverride = param("dateOverride");
    if (timeOverride == null && dateOverride == null) return;
    setSheet((s) => ({
      ...s,
      ...(timeOverride != null ? { time: timeOverride, timeOverride: !!timeOverride.trim() } : {}),
      ...(dateOverride != null ? { date: dateOverride, dateOverride: !!dateOverride.trim() } : {}),
    }));
  }, [loaded, printMode]);

  useEffect(() => {
    const before = () => {
      setPrintedAt(printStamp());
      setNativePrinting(true);
    };
    const after = () => setNativePrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  useEffect(() => {
    if (printMode || blankPrintMode) return;
    const syncClock = () => setClockStamp(printStamp());
    syncClock();
    const timer = window.setInterval(syncClock, 15000);
    return () => window.clearInterval(timer);
  }, [printMode, blankPrintMode]);
  const [editingLot, setEditingLot] = useState<LotKey | null>(null); // which back-of-sheet lot
  const [fillOpen, setFillOpen] = useState(false); // mobile Fill Rows mode
  const [prevOpen, setPrevOpen] = useState(false); // Prev Sheets archive
  const [mobileSheetView, setMobileSheetView] = useState<"pan" | "fit">("pan");
  const [mobileSearchRequest, setMobileSearchRequest] = useState(0);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const lastTouchTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); // debounce for background PDF pre-build
  const lastSyncRef = useRef<string | null>(null); // JSON of the sheet known to match the server
  const lastSyncedSheetRef = useRef<LotSheetData | null>(null);
  const lastRevisionRef = useRef(0);
  const suppressNextSheetMarkRef = useRef(false);
  const forceNextSaveRef = useRef(false);
  const savingRef = useRef(false); // true while a save PUT is in flight (saves are serialized)
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const pendingBatchRef = useRef<LotSheetPendingBatch | null>(null);
  const pollingRef = useRef(false);
  const sheetRef = useRef<LotSheetData>(sheet); // always-current sheet, for the poll loop
  useEffect(() => {
    sheetRef.current = sheet;
    if (!loaded || printMode) return;
    if (suppressNextSheetMarkRef.current) {
      suppressNextSheetMarkRef.current = false;
      return;
    }
  }, [sheet, loaded, printMode]);

  // The sheet text runs +2px over the base sizes (the old adjustable "Sheet
  // Settings" stepper is gone — everyone gets the standard size).
  const FONT_BASE = 2;
  const displaySheet = blankPrintMode ? blankPrintSheet() : sheet;
  const displayFlags: FlagMap = blankPrintMode ? {} : flags;

  function writeLocalSheet(json: string) {
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch {}
  }

  function writeOutbox(batch: LotSheetPendingBatch | null) {
    try {
      if (batch) localStorage.setItem(OUTBOX_KEY, JSON.stringify(batch));
      else localStorage.removeItem(OUTBOX_KEY);
    } catch {}
  }

  function adoptServerSheet(nextSheet: LotSheetData, json: string, updatedAt: string | null | undefined, revision?: number) {
    suppressNextSheetMarkRef.current = true;
    sheetRef.current = nextSheet;
    setSheet(nextSheet);
    lastSyncRef.current = json;
    lastSyncedSheetRef.current = nextSheet;
    if (typeof revision === "number") lastRevisionRef.current = revision;
    writeLocalSheet(json);
  }

  // Load the shared current sheet from the server. Show the device cache first
  // so the page isn't blank on a slow connection, then sync with the server.
  useEffect(() => {
    let cancelled = false;
    let loadBaseJson = JSON.stringify(sheetRef.current);
    if (param("blank") === "1") {
      setSheet(blankPrintSheet());
      setLoaded(true);
      setSyncReady(true);
      return () => {
        cancelled = true;
      };
    }
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const cachedSheet = JSON.parse(cached);
        sheetRef.current = cachedSheet;
        setSheet(cachedSheet);
        loadBaseJson = cached;
      }
      const pending = parsePendingBatch(localStorage.getItem(OUTBOX_KEY));
      if (pending) {
        pendingBatchRef.current = pending;
        if (!cached) {
          sheetRef.current = pending.snapshot;
          setSheet(pending.snapshot);
          loadBaseJson = JSON.stringify(pending.snapshot);
        }
      }
    } catch {}
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const loadServer = () => {
      fetch("/api/sheet", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("Sheet load failed");
          return r.json();
        })
        .then((d) => {
        if (cancelled) return;
        if (d && d.sheet) {
          const serverJson = JSON.stringify(d.sheet);
          if (pendingBatchRef.current) {
            // Keep acknowledged offline work on screen, then replay the exact
            // same operation IDs against the latest shared baseline.
            lastSyncRef.current = serverJson;
            lastSyncedSheetRef.current = d.sheet;
            lastRevisionRef.current = Number(d.revision || 0);
          } else if (JSON.stringify(sheetRef.current) === loadBaseJson) {
            adoptServerSheet(d.sheet, serverJson, d.updatedAt, d.revision);
          } else {
            // The user edited before the initial fetch returned. Do not replace
            // their work; mark the server baseline so their local edits save.
            lastSyncRef.current = serverJson;
            lastSyncedSheetRef.current = d.sheet;
            lastRevisionRef.current = Number(d.revision || 0);
          }
        }
        // If the server has no sheet yet, leave lastSyncRef null so the device's
        // current sheet gets pushed up on the first autosave.
          setSyncReady(true);
        })
        .catch(() => {
          if (!cancelled) retryTimer = setTimeout(loadServer, 2500);
        })
        .finally(() => {
        if (!cancelled) setLoaded(true);
        });
    };
    loadServer();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  // Always keep a local backup of what is on screen. This is separate from the
  // server save gate above: if the first server load is failing, we still keep
  // the user's in-browser work, but we do not push stale cached data over the
  // shared sheet until a server baseline has been loaded.
  useEffect(() => {
    if (!loaded || printMode) return;
    writeLocalSheet(JSON.stringify(sheet));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, loaded, printMode]);


  // Pre-build the PDF when flags or the maintenance toggle change, and once on
  // load (the sheet itself is pre-built after each autosave) so a later
  // "Print PDF" is instant.
  useEffect(() => {
    if (loaded && flagsLoaded) schedulePrewarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags, showMaint, loaded, flagsLoaded]);

  // Save the current sheet to the server — SERIALIZED (one PUT at a time). This
  // is the fix for "the cleared grid reappears": without serialization a slow,
  // stale PUT (e.g. the full grid you had before pressing Clear) could land AFTER
  // a newer one, reverting the server, and the poll below would then re-adopt
  // that old grid. Now each save waits for the previous, always sends the latest
  // sheet, and re-runs if edits arrived while it was in flight.
  function runSave(): Promise<void> {
    if (!syncReady) return Promise.resolve();
    if (savingRef.current) return saveInFlightRef.current || Promise.resolve(); // a save is already in flight
    const restoredBatch = pendingBatchRef.current;
    const snapshot = restoredBatch?.snapshot || sheetRef.current;
    const json = JSON.stringify(snapshot);
    if (!restoredBatch && json === lastSyncRef.current) return Promise.resolve(); // nothing new to push
    let batch = restoredBatch;
    if (!batch) {
      const baseSheet = lastSyncedSheetRef.current;
      const force = forceNextSaveRef.current;
      forceNextSaveRef.current = false;
      const ops: LotSheetOp[] = force
        ? [{ type: "replace_sheet", sheet: snapshot }]
        : diffLotSheetOps(baseSheet, snapshot);
      if (!ops.length) return Promise.resolve();
      batch = createPendingBatch(ops, snapshot, lastRevisionRef.current);
      pendingBatchRef.current = batch;
      writeOutbox(batch);
    }
    savingRef.current = true;
    setSyncError(false);
    const task = (async () => {
      try {
        writeLocalSheet(json);
      } catch {}
      try {
        const r = await fetch("/api/sheet/ops", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: batch.entries, actor: getDeviceActor() }),
        });
        if (!r.ok) throw new Error(`Sheet save failed (${r.status})`);
        const d = await r.json();
        if (d && d.ok) {
          const savedSheet = (d.sheet || snapshot) as LotSheetData;
          const savedJson = JSON.stringify(savedSheet);
          const currentJson = JSON.stringify(sheetRef.current);
          if (currentJson !== json) {
            const merged = mergeLotSheet(snapshot, sheetRef.current, savedSheet);
            const mergedJson = JSON.stringify(merged);
            suppressNextSheetMarkRef.current = true;
            sheetRef.current = merged;
            setSheet(merged);
            writeLocalSheet(mergedJson);
          } else if (savedJson !== json) {
            suppressNextSheetMarkRef.current = true;
            sheetRef.current = savedSheet;
            setSheet(savedSheet);
            writeLocalSheet(savedJson);
          }
          lastSyncRef.current = savedJson;
          lastSyncedSheetRef.current = savedSheet;
          lastRevisionRef.current = Number(d.revision || lastRevisionRef.current);
          if (pendingBatchRef.current === batch) {
            pendingBatchRef.current = null;
            writeOutbox(null);
          }
          setSavedAt(new Date());
          setSyncError(false);
          schedulePrewarm(); // pre-build the PDF for the saved sheet
        }
      } catch {
        setSyncError(true);
      }
      savingRef.current = false;
      saveInFlightRef.current = null;
      // Edits landed while we were saving - flush them right away.
      if (JSON.stringify(sheetRef.current) !== lastSyncRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(runSave, 250);
      }
    })();
    saveInFlightRef.current = task;
    return task;
  }

  // Autosave (debounced) to the server, so every device sees the same sheet.
  useEffect(() => {
    if (!loaded || !syncReady || printMode) return;
    if (JSON.stringify(sheet) === lastSyncRef.current) return; // nothing new
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(runSave, 250);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, loaded, syncReady, printMode]);

  // Safety net: nonstop editing keeps resetting the debounce above, so also flush
  // pending edits at least every couple of seconds (runSave is a no-op when
  // there's nothing new or a save is already running).
  useEffect(() => {
    if (!loaded || !syncReady || printMode) return;
    const iv = setInterval(runSave, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, syncReady, printMode]);

  // Flush the latest edits when the tab is backgrounded / closed / navigated away
  // (screen lock, app switch) — with keepalive so the request survives — so work
  // is never lost between the last debounced save and leaving the page.
  useEffect(() => {
    if (printMode) return;
    const flush = () => {
      const json = JSON.stringify(sheetRef.current);
      if (json === lastSyncRef.current) return;
      try {
        writeLocalSheet(json);
      } catch {}
      if (!syncReady) return;
      try {
        let batch = pendingBatchRef.current;
        if (!batch) {
          const ops: LotSheetOp[] = forceNextSaveRef.current
            ? [{ type: "replace_sheet", sheet: sheetRef.current }]
            : diffLotSheetOps(lastSyncedSheetRef.current, sheetRef.current);
          if (!ops.length) return;
          forceNextSaveRef.current = false;
          batch = createPendingBatch(ops, sheetRef.current, lastRevisionRef.current);
          pendingBatchRef.current = batch;
          writeOutbox(batch);
        }
        fetch("/api/sheet/ops", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: batch.entries, actor: getDeviceActor() }),
          keepalive: true,
        });
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [printMode, syncReady]);

  // Poll for changes made on other devices. Adopt the server's sheet only when
  // there are no unsaved local edits, so we never clobber in-progress typing.
  useEffect(() => {
    if (!loaded || !syncReady || printMode) return;
    const poll = async () => {
      if (savingRef.current || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const startingRevision = lastRevisionRef.current;
        const previousBase = lastSyncedSheetRef.current;
        let cursor = startingRevision;
        let nextServerSheet = previousBase;
        let updatedAt: string | null | undefined;
        let pages = 0;
        while (pages < 50) {
          const response = await fetch(`/api/sheet/ops?since=${cursor}&limit=500`, { cache: "no-store" });
          if (!response.ok) throw new Error(`Sheet catch-up failed (${response.status})`);
          const d = await response.json();
          if (!d || !d.sheet) break;
          updatedAt = d.updatedAt;
          const records = (Array.isArray(d.ops) ? d.ops : []) as LotSheetOpRecord[];
          if (!nextServerSheet) {
            nextServerSheet = d.sheet as LotSheetData;
            cursor = Number(d.revision || cursor);
            break;
          }
          if (records.length) {
            const page = applyOperationPage(nextServerSheet, cursor, records);
            nextServerSheet = page.sheet;
            cursor = page.revision;
          } else if (Number(d.revision || 0) > cursor) {
            // Safe recovery if an old operation page has eventually been
            // compacted: the API's current snapshot becomes the new baseline.
            nextServerSheet = d.sheet as LotSheetData;
            cursor = Number(d.revision || cursor);
          }
          pages += 1;
          if (!d.hasMore) break;
        }
        if (savingRef.current || cursor <= startingRevision || !nextServerSheet) return;
        const serverJson = JSON.stringify(nextServerSheet);
        const localJson = JSON.stringify(sheetRef.current);
        if (localJson === lastSyncRef.current && !pendingBatchRef.current) {
          adoptServerSheet(nextServerSheet, serverJson, updatedAt, cursor);
          return;
        }
        const merged = mergeLotSheet(previousBase, sheetRef.current, nextServerSheet);
        const mergedJson = JSON.stringify(merged);
        lastSyncRef.current = serverJson;
        lastSyncedSheetRef.current = nextServerSheet;
        lastRevisionRef.current = cursor;
        if (mergedJson !== localJson) {
          suppressNextSheetMarkRef.current = true;
          sheetRef.current = merged;
          setSheet(merged);
          writeLocalSheet(mergedJson);
        }
      } catch {
        setSyncError(true);
      } finally {
        pollingRef.current = false;
      }
    };
    const iv = setInterval(poll, 1200);
    return () => clearInterval(iv);
  }, [loaded, syncReady]);

  function setField(field: LotStringField, value: string) {
    setSheet((s) => ({
      ...s,
      [field]: value,
      ...(field === "time" ? { timeOverride: !!value.trim() } : {}),
      ...(field === "date" ? { dateOverride: !!value.trim() } : {}),
    }));
  }

  function getNum(id: string | null): string {
    if (!id) return "";
    return cellToNum(displaySheet.cells[id]);
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
    if (prev && prev !== "X" && prev !== num) noteRemoved(prev);
    setSheet((s) => {
      const cells = { ...s.cells };
      if (num) cells[id] = num;
      else delete cells[id];
      // Clearing a spot lifts its lock (an empty spot has nothing to protect).
      const locks = num ? s.locks : (s.locks || []).filter((x) => x !== id);
      return { ...s, cells, locks };
    });
  }

  // ---- locked spots (survive "Clear Grid") ----
  const isLocked = (id: string) => (displaySheet.locks || []).includes(id);
  function toggleLock(id: string) {
    setSheet((s) => {
      const cur = s.locks || [];
      return { ...s, locks: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  }

  function flagFor(num: string): FlagEntry {
    return (num && displayFlags[num]) || EMPTY_FLAG;
  }

  // Optimistically fold a just-saved entry into the shared flag cache so the UI
  // updates instantly (the POST to /api/flags also bumps the live pulse, which
  // reconciles every other device). Mirrors FuelSheet's onFlagsUpdated.
  function onBusFlagsUpdated(bus: string, entry: FlagEntry) {
    qc.setQueryData<FlagMap>(["flags"], (prev = {}) => {
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
  function printedLotsHaveContent(s: LotSheetData | null | undefined): boolean {
    return ["north", "east", "fence"].some((key) =>
      (s?.lots?.[key as LotKey] || []).some((value) => value && value !== "X")
    );
  }

  // "New" resets the daily grid (cells, counters, time/date) but keeps the
  // back-of-sheet lots, which don't change as often.
  async function newSheet() {
    await archiveSheet(sheet);
    offerUndo("Grid cleared");
    // Locked buses stay put through the clear (and blocked X spots stay blocked).
    setSheet((s) => {
      const kept: Record<string, string> = {};
      for (const id of s.locks || []) {
        const n = cellToNum(s.cells[id]);
        if (n) kept[id] = n;
      }
      for (const [id, v] of Object.entries(s.cells || {})) {
        if (cellToNum(v) === "X") kept[id] = "X";
      }
      return { ...emptySheet(), lots: s.lots, locks: s.locks || [], cells: kept };
    });
  }

  // Clears just the back-of-sheet lots (North / East / Fence).
  async function clearLots() {
    await archiveSheet(sheetRef.current);
    offerUndo("Lots cleared");
    // Clear only the back-of-sheet lots; keep the Turnover-managed lots
    // (R/C, Apron, Lanes, Bay) intact.
    setSheet((s) => ({ ...s, lots: { ...(s.lots || {}), north: [], east: [], fence: [] } }));
  }

  function requestClearGrid() {
    if (gridHasContent(sheet)) setConfirmClear({ kind: "grid" });
    else void newSheet();
  }

  function requestClearLots() {
    if (printedLotsHaveContent(sheet)) setConfirmClear({ kind: "lots" });
    else void clearLots();
  }

  function requestClearLocation(key: LotKey) {
    const label = LOT_LOCATION_LABELS[key] || key;
    const count = (sheetRef.current.lots?.[key] || []).filter((value) => value && value !== "X").length;
    if (!count) return;
    // Close the parent editor before confirmation so mobile never has two
    // full-screen dialogs fighting for the same viewport.
    setEditingLot(null);
    setEditingBay(null);
    setShopOpen(false);
    setConfirmClear({ kind: "location", key, label, count });
  }

  async function clearLocation(target: Extract<ClearTarget, { kind: "location" }>) {
    await archiveSheet(sheetRef.current);
    offerUndo(`${target.label} cleared`);
    setSheet((current) => applyLotSheetOp(current, { type: "clear_lots", keys: [target.key] }));
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
    forceNextSaveRef.current = true;
    setPrevOpen(false);
  }

  function openCell(id: string, subLabel: string) {
    // A drag fires a click on the source cell when it ends — don't open the editor for it.
    if (Date.now() < suppressClickUntil.current) return;
    // Select mode: taps toggle the spot in/out of the selection instead.
    // Buses, empty spots, and blocked spots are all selectable — the bar's
    // actions each apply to the spots they make sense for.
    if (selectMode) {
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
  // Block empty spots / reopen blocked ones — for everything selected at once.
  function bulkBlockToggle() {
    const empties = selected.filter((id) => !getNum(id));
    const xs = selected.filter((id) => getNum(id) === "X");
    if (!empties.length && !xs.length) return;
    offerUndo("Blocked spots updated");
    setSheet((s) => {
      const cells = { ...s.cells };
      for (const id of empties) cells[id] = "X";
      for (const id of xs) delete cells[id];
      return { ...s, cells };
    });
    exitSelectMode();
  }
  // Lock (or unlock) every selected bus in place — locked buses survive Clear Grid.
  function bulkLockToggle() {
    const ids = selected.filter((id) => {
      const n = getNum(id);
      return n && n !== "X";
    });
    if (!ids.length) return;
    const allLocked = ids.every((id) => isLocked(id));
    offerUndo(
      allLocked
        ? `Unlocked ${ids.length} bus${ids.length === 1 ? "" : "es"}`
        : `Locked ${ids.length} bus${ids.length === 1 ? "" : "es"} in place`
    );
    setSheet((s) => {
      const cur = new Set(s.locks || []);
      for (const id of ids) {
        if (allLocked) cur.delete(id);
        else cur.add(id);
      }
      return { ...s, locks: Array.from(cur) };
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
        actor: getDeviceActor(),
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
  function openPdfTarget(target: string, flush?: () => Promise<unknown> | unknown) {
    // Absolute URL — the print tab opens as about:blank, where a relative
    // "/api/pdf" wouldn't resolve to the site.
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
    Promise.resolve(flush ? flush() : null)
      .catch(() => {})
      .finally(go);
  }

  function openPdf() {
    // Absolute URL: the print tab opens as about:blank, where a relative
    // "/api/pdf" wouldn't resolve to the site.
    const qs = new URLSearchParams({ maint: showMaint ? "1" : "0" });
    if (sheet.timeOverride && sheet.time?.trim()) qs.set("timeOverride", sheet.time);
    if (sheet.dateOverride && sheet.date?.trim()) qs.set("dateOverride", sheet.date);
    const target = `${window.location.origin}/api/pdf?${qs.toString()}`;
    openPdfTarget(target, () => runSave());
  }

  function openBlankPdf() {
    openPdfTarget(`${window.location.origin}/api/pdf?blank=1&maint=0`);
  }

  // ---- shared lot lists (North/East/Fence + Apron/Cards from the Shop menu) ----
  // Lists are kept blank-free (Bay is the only positional lot and has its own
  // setter below).
  function lotList(key: string): string[] {
    return ((displaySheet.lots && displaySheet.lots[key as LotKey]) || []).filter((b) => b);
  }
  function addToLot(key: string, bus: string) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = (lots[key as LotKey] || []).filter((b) => b);
      return { ...s, lots: { ...lots, [key]: [...arr, bus] } as Lots };
    });
  }
  function removeFromLot(key: string, index: number) {
    const removed = lotList(key)[index];
    if (removed && removed !== "X") noteRemoved(removed);
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = (lots[key as LotKey] || []).filter((b) => b);
      // Flags are NEVER auto-cleared when a bus leaves a lot — they persist
      // until a user clears them in the flag menu.
      return { ...s, lots: { ...lots, [key]: arr.filter((_, i) => i !== index) } as Lots };
    });
  }
  function moveInLot(key: string, index: number, dir: number) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = (lots[key as LotKey] || []).filter((b) => b);
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
      const arr = (lots[key as LotKey] || []).filter((b) => b);
      if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return s;
      const [bus] = arr.splice(from, 1);
      arr.splice(to, 0, bus);
      return { ...s, lots: { ...lots, [key]: arr } as Lots };
    });
  }
  // Bay is positional: set one of the 10 fixed spots (or "" / "X").
  function setBaySlot(i: number, num: string) {
    setSheet((s) => {
      const lots: Lots = { north: [], east: [], fence: [], ...(s.lots || {}) };
      const arr = Array.from({ length: BAY_SPOTS }, (_, j) => (lots.bay || [])[j] || "");
      arr[i] = num;
      return { ...s, lots: { ...lots, bay: arr } as Lots };
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
      if (exceptCellId === `${key}:${idx}`) continue; // the slot being edited
      const label = LOT_LOCATION_LABELS[key] || key;
      // Bays are positional, so say exactly which one ("Bay 3").
      return key === "bay" ? `${label} ${idx + 1}` : label;
    }
    return "";
  }

  // Toolbar "find bus": scroll to the bus and flash it. The message + steady
  // highlight are DERIVED from the search text, so they stay up (and stay
  // correct as the sheet changes) until the search is cleared.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    findBusRef.current = findBus;
  });

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
          k === "bay"
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
  const flagSummary = groupFlaggedBuses(displayFlags);

  // Where each bus currently sits on the grid (bus number -> "Row 5 · #85").
  const busLocations: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(displaySheet.cells || {})) {
    const n = cellToNum(v);
    if (!n || n === "X") continue;
    const loc = cellLocationLabel(id);
    if (loc) (busLocations[n] = busLocations[n] || []).push(loc);
  }
  // Lots too (Apron, Bay 3, Cards 5, North Lot, …) so the flag summary can say
  // where EVERY flagged bus sits, not just the ones on the grid.
  for (const [key, arr] of Object.entries(displaySheet.lots || {})) {
    if (!Array.isArray(arr)) continue;
    const label = LOT_LOCATION_LABELS[key] || key;
    arr.forEach((b, idx) => {
      if (!b || b === "X") return;
      const loc = key === "bay" ? `${label} ${idx + 1}` : label;
      (busLocations[b] = busLocations[b] || []).push(loc);
    });
  }

  const displayFleet = fleetStats(displaySheet, displayFlags, masterBuses);

  // "# OF VEHICLES OFF PROPERTY" is auto-counted from the OFF PROPERTY flag.
  // Support vehicles such as JUDI never contribute to fleet totals.
  const offPropertyCount = blankPrintMode ? "" : displayFleet.offProperty.size;

  // "# OF VEHICLES IN SHOP" is auto-counted too: everything on the Shop page
  // (Apron + Bays + Cards) plus any bus flagged IN SHOP.
  const inShopSet = new Set(displayFleet.inShop);
  for (const [bus, e] of Object.entries(displayFlags)) {
    if (displayFleet.activeFleet.has(bus) && (e.flags || []).includes("shop")) inShopSet.add(bus);
  }
  const inShopCount = blankPrintMode ? "" : inShopSet.size;

  // Both counters are editable. OFF PROPERTY auto-fills the flag count when left
  // blank (like the TIME field) but a typed number wins; clearing it returns to
  // the auto count. IN SHOP is manual only for now (no auto count).
  const offPropertyDisplay = blankPrintMode
    ? ""
    : (sheet.offProperty || "").trim()
      ? sheet.offProperty
      : String(offPropertyCount);
  const inShopDisplay = blankPrintMode ? "" : sheet.inShop || "";

  // The live search: message + steady highlight persist until the box clears.
  const foundBus = findVal.length >= 4 ? findVal : "";
  const foundWhere = foundBus ? locateBus(foundBus, null) : "";
  const printHeaderActive = printMode || nativePrinting;
  const activeStamp = printHeaderActive ? printedAt : clockStamp;
  const headerTime = blankPrintMode
    ? ""
    : sheet.timeOverride && sheet.time
      ? sheet.time
      : activeStamp.time;
  const headerDate = blankPrintMode
    ? ""
    : sheet.dateOverride && sheet.date
      ? sheet.date
      : activeStamp.date;

  // Shared with Home: lots are North/East/Fence; shop is Apron/Bays/Cards.
  const fleet = fleetStats(sheet, flags, masterBuses);
  const fleetLocations = fleetBusLocations(sheet, flags); // bus -> every place it sits (grid, lots, shop, off-property)
  const onGridCount = fleet.onGrid.size;
  const inLotsCount = fleet.inLots.size;
  const readyForServiceCount = fleet.readyForService.size;
  const notReadyForServiceCount = fleet.notReadyForService.size;
  // Off-property and in-shop flags keep unplaced active buses out of Missing;
  // they remain listed for reference in the status dialog.
  const missingBuses = fleet.missing;
  const accountedBuses = fleet.accountedByFlagOnly;

  useEffect(() => {
    setLotStatus({ usable: readyForServiceCount, outOfService: notReadyForServiceCount });
  }, [notReadyForServiceCount, readyForServiceCount, setLotStatus]);

  useEffect(() => () => setLotStatus(null), [setLotStatus]);

  useEffect(() => {
    if (printMode) return;
    registerLotActions({
      openStatus: () => setServiceDetail(notReadyForServiceCount ? "outOfService" : "usable"),
      openSearch: () => setMobileSearchRequest((request) => request + 1),
    });
    return () => registerLotActions(null);
  }, [notReadyForServiceCount, printMode, registerLotActions]);

  // The whole sheet as clean text — for pasting into a group chat at handoff.
  function buildShareText(): string {
    const lines: string[] = [];
    lines.push(`PACE LOT SHEET — ${[headerDate, headerTime].filter(Boolean).join(" ")}`);
    lines.push(
      `Ready for Use: ${onGridCount} · In Lots: ${inLotsCount} · Off Property: ${offPropertyCount}` +
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

  function setMobileZoom(next: "pan" | "fit", clientX?: number, clientY?: number) {
    const viewport = sheetScrollRef.current;
    if (!viewport || next === mobileSheetView) return;

    if (next === "fit" || clientX == null || clientY == null) {
      setMobileSheetView(next);
      if (next === "fit") {
        requestAnimationFrame(() => {
          viewport.scrollLeft = 0;
          viewport.scrollTop = 0;
        });
      }
      return;
    }

    const paper = viewport.querySelector<HTMLElement>(".lot-sheet-front");
    if (!paper) {
      setMobileSheetView(next);
      return;
    }
    const paperRect = paper.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (clientX - paperRect.left) / paperRect.width));
    const yRatio = Math.max(0, Math.min(1, (clientY - paperRect.top) / paperRect.height));
    setMobileSheetView(next);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void viewport.scrollWidth;
        const expandedPaper = viewport.querySelector<HTMLElement>(".lot-sheet-front");
        if (!expandedPaper) return;
        viewport.scrollLeft =
          expandedPaper.offsetLeft + expandedPaper.offsetWidth * xRatio - viewport.clientWidth / 2;
        viewport.scrollTop =
          expandedPaper.offsetTop + expandedPaper.offsetHeight * yRatio - viewport.clientHeight / 2;
      });
    });
  }

  function toggleMobileZoomAt(clientX: number, clientY: number) {
    setMobileZoom(mobileSheetView === "fit" ? "pan" : "fit", clientX, clientY);
  }

  function onMobileDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input, button, select, textarea")) return;
    toggleMobileZoomAt(event.clientX, event.clientY);
  }

  function onMobileTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const now = Date.now();
    const previous = lastTouchTapRef.current;
    lastTouchTapRef.current = { at: now, x: touch.clientX, y: touch.clientY };
    if (!previous) return;
    const distance = Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y);
    if (now - previous.at > 300 || distance > 28) return;
    event.preventDefault();
    lastTouchTapRef.current = null;
    toggleMobileZoomAt(touch.clientX, touch.clientY);
  }

  // Global header search fires this when we're already on the Lot Sheet, so
  // "Open on Lot Sheet" scrolls + flashes instead of a no-op navigation.
  useEffect(() => {
    const onLotFind = (event: Event) => {
      const bus = sanitizeBus(String((event as CustomEvent).detail || ""));
      if (!bus) return;
      setFindVal(bus);
      findBusRef.current?.(bus);
    };
    window.addEventListener("pace:lot-find", onLotFind);
    return () => window.removeEventListener("pace:lot-find", onLotFind);
  }, []);

  function onMobileFind(value: string) {
    const next = sanitizeBus(value);
    setFindVal(next);
    if (isKnown(next)) findBus(next);
  }

  return (
    <div className={chromeStyles.page}>
      {/* Toolbar — never printed */}
      <Toolbar className={`${chromeStyles.toolbar} no-print`}>
        <div className={chromeStyles.serviceCounts}>
          <Button
            size="sm"
            className={chromeStyles.readyButton}
            onPress={() => setServiceDetail("usable")}
            aria-label={`${readyForServiceCount} usable buses on the service grid`}
          >
            {readyForServiceCount} Usable
          </Button>
          <Button
            size="sm"
            className={chromeStyles.outButton}
            onPress={() => setServiceDetail("outOfService")}
            aria-label={`${notReadyForServiceCount} out of service buses in lots or shop`}
          >
            {notReadyForServiceCount} Out of Service
          </Button>
          <Button
            size="sm"
            className={chromeStyles.shopButton}
            onPress={() => setShopOpen(true)}
            aria-label={`${fleet.inShop.size} buses in the shop. Open the shop overview.`}
          >
            {fleet.inShop.size} in the Shop
          </Button>
        </div>
        <Button
          size="sm"
          className={chromeStyles.summaryButton}
          data-warning={missingBuses.length ? "true" : undefined}
          onPress={() => setMissingOpen(true)}
          aria-label={`${onGridCount} ready for use, ${inLotsCount} in lots, ${missingBuses.length} missing. Show missing buses.`}
        >
          {onGridCount} Ready for Use · {inLotsCount} In Lots · {missingBuses.length} Missing
        </Button>
        {syncError && <span className={chromeStyles.saved}>Offline · retrying</span>}
        <div className={chromeStyles.viewToggle} aria-label="Sheet view mode">
          <span className={chromeStyles.viewLabel}>View</span>
          <Button
            size="sm"
            variant={mobileSheetView === "pan" ? "primary" : "secondary"}
            onPress={() => setMobileSheetView("pan")}
          >
            Pan
          </Button>
          <Button
            size="sm"
            variant={mobileSheetView === "fit" ? "primary" : "secondary"}
            onPress={() => setMobileSheetView("fit")}
          >
            Fit
          </Button>
        </div>
        <ToolbarGroup className={chromeStyles.actions}>
          <Button variant="primary" onPress={() => setFillOpen(true)}>
            <LayoutGrid aria-hidden="true" /> Fill Rows
          </Button>
          <Button onPress={() => setManagerOpen(true)}>
            <Flag aria-hidden="true" /> Edit Flags
          </Button>
          <Button
            variant={selectMode ? "primary" : "secondary"}
            onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            <ListChecks aria-hidden="true" /> Select
          </Button>
          <Button onPress={() => setShopOpen(true)}>
            <Wrench aria-hidden="true" /> Shop
          </Button>
          <ActionMenu
            label={<><MoreHorizontal size={16} /> More</>}
            items={[
              { id: "history", label: "Previous sheets", icon: <History size={16} /> },
              { id: "share", label: "Share as text", icon: <Share2 size={16} /> },
              {
                id: "maintenance",
                label: showMaint ? "Maintenance info: On" : "Maintenance info: Off",
                icon: showMaint ? <Check size={16} /> : <span aria-hidden="true" />,
              },
              { id: "clear-grid", label: "Clear grid", icon: <Eraser size={16} />, tone: "danger" },
              { id: "clear-lots", label: "Clear lots", icon: <ListX size={16} />, tone: "danger" },
            ]}
            onAction={(key) => {
              if (key === "history") setPrevOpen(true);
              if (key === "share") shareSheet();
              if (key === "maintenance") setShowMaint((current) => !current);
              if (key === "clear-grid") requestClearGrid();
              if (key === "clear-lots") requestClearLots();
            }}
          />
          <SplitButton
            variant="primary"
            onPress={openPdf}
            menuLabel="Print options"
            items={[{ id: "blank", label: "Print blank sheet", icon: <FileDown size={16} /> }]}
            onAction={(key) => {
            }}
          >
            <FileDown aria-hidden="true" /> Print PDF
          </SplitButton>
        </ToolbarGroup>
      </Toolbar>

      {/* The printable sheet */}
      <DndContext id="lot-sheet-dnd" sensors={dndSensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div
        ref={sheetScrollRef}
        className={`sheet-scroll sheet-scroll--${mobileSheetView}`}
        data-paper-viewport=""
        data-paper-profile="letter-portrait"
        style={{ "--fz": `${FONT_BASE}px` } as CSSProperties}
        onDoubleClick={onMobileDoubleClick}
        onTouchEndCapture={onMobileTouchEnd}
      >
        <div
          className={`sheet lot-sheet-front ${showMaint ? "sheet--maint" : ""}`}
          onKeyDown={onSheetKeyDown}
          data-paper-page=""
          data-paper-profile="letter-portrait"
          data-sheet-id="lot"
          data-page-number="1"
        >
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
                  value={headerTime}
                  onChange={(e) => setField("time", e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="head__title">LOT SHEET</div>
              <div className="head__field head__date">
                <label>DATE:</label>
                <DatePickerField
                  value={headerDate}
                  onValueChange={(value) => setField("date", value)}
                  ariaLabel="Lot Sheet date"
                />
              </div>
            </div>
          </div>

          {/* Counters */}
          <div className="counters">
            <div className="counter">
              <label># OF VEHICLES OFF PROPERTY:</label>
              <input
                value={offPropertyDisplay}
                onChange={(e) => setField("offProperty", e.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                title="Auto-fills from the OFF PROPERTY flag count when blank — type a number to override"
              />
            </div>
            <div className="counter">
              <label># OF VEHICLES IN SHOP:</label>
              <input
                value={inShopDisplay}
                onChange={(e) => setField("inShop", e.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                title="Number of vehicles in the shop"
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
                  locked={isLocked(frontCellId(c))}
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
                    <GridCell key={`b${b}c${c}`} id={id} slotLabel={null} {...cellProps(id)} selected={selected.includes(id)} foundBus={foundBus} locked={isLocked(id)} onOpen={openCell} />
                  );
                }
                if (slot === "X") {
                  return <GridCell key={`b${b}c${c}`} id={null} slotLabel="X" num="" entry={null} onOpen={openCell} />;
                }
                const id = numberedCellId(slot as number);
                return (
                  <GridCell key={`b${b}c${c}`} id={id} slotLabel={slot} {...cellProps(id)} selected={selected.includes(id)} foundBus={foundBus} locked={isLocked(id)} onOpen={openCell} />
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

        {!blankPrintMode && (
          <>
            {/* Back of the sheet — ordered lot lists, printed on page 2 */}
            <div
              className="back-sheet"
              data-paper-page=""
              data-paper-profile="letter-portrait"
              data-sheet-id="lot"
              data-page-number="2"
            >
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
          </>
        )}
      </div>

      {/* The bus chip that follows the pointer while dragging */}
      <DragOverlay dropAnimation={null}>
        {dragNum ? (
          <div className={chromeStyles.dragChip}>
            <TypeCodes num={dragNum} variant="ui" />
            {busLabel(dragNum)}
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {!printMode && (
        <MobileLotChrome
          zoom={mobileSheetView}
          onZoom={setMobileZoom}
          searchRequest={mobileSearchRequest}
          onFill={() => setFillOpen(true)}
          onFlags={() => setManagerOpen(true)}
          onShop={() => setShopOpen(true)}
          onPrint={openPdf}
          selectMode={selectMode}
          onToggleSelect={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          onPrev={() => setPrevOpen(true)}
          onShare={shareSheet}
          onPrintBlank={openBlankPdf}
          onClearGrid={requestClearGrid}
          onClearLots={requestClearLots}
          showMaint={showMaint}
          onShowMaint={setShowMaint}
          usableCount={readyForServiceCount}
          outCount={notReadyForServiceCount}
          missingCount={missingBuses.length}
          onUsable={() => setServiceDetail("usable")}
          onOut={() => setServiceDetail("outOfService")}
          onMissing={() => setMissingOpen(true)}
          findVal={findVal}
          onFind={onMobileFind}
          foundWhere={foundWhere}
          foundBus={foundBus}
        />
      )}

      {/* Signals the headless PDF renderer that the sheet + flags have loaded. */}
      {loaded && flagsLoaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}

      {editing && !flagBus && (
        <CellEditor
          subLabel={editing.subLabel}
          value={editing.seed != null ? editing.seed : getNum(editing.id)}
          flags={flags}
          cellId={editing.id}
          locate={locateBus}
          onRelocate={relocateBus}
          blockable
          locked={isLocked(editing.id)}
          onToggleLock={() => toggleLock(editing.id)}
          sendTargets={LOTS.map((l) => ({ key: l.key, label: LOT_LOCATION_LABELS[l.key] || l.title }))}
          onSendToLot={(bus, key) => sendCellBusToLot(editing.id, bus, key)}
          onEditFlags={(bus) => setFlagBus(bus)} /* stacks on top — Done returns here */
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
      {missingOpen && !flagBus && (
        <MissingBusesModal
          missingBuses={missingBuses}
          accountedBuses={accountedBuses}
          flagFor={flagFor}
          onEditFlags={setFlagBus}
          onClose={() => setMissingOpen(false)}
        />
      )}

      {serviceDetail && !flagBus && (
        <ServiceDetailModal
          kind={serviceDetail}
          readyForService={fleet.readyForService}
          notReadyForService={fleet.notReadyForService}
          fleetLocations={fleetLocations}
          flagFor={flagFor}
          onEditFlags={setFlagBus}
          onClose={() => setServiceDetail(null)}
        />
      )}

      {editingLot && !flagBus && (
        <LotEditor
          title={LOT_LOCATION_LABELS[editingLot] || LOTS.find((l) => l.key === editingLot)?.title || ""}
          subtitle={
            editingLot === "apron"
              ? "Buses anywhere on the apron — the order shows on the Turnover sheet."
              : editingLot === "cards"
                ? "No fixed spots — screen-only, never printed."
                : undefined
          }
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
          onClearRequest={() => requestClearLocation(editingLot)}
          onClose={() => setEditingLot(null)}
        />
      )}

      {/* The SHOP menu — edit Apron / Bays / Cards right from the lot sheet.
          Screen-only data flows; the printout is never touched. */}
      {shopOpen && editingLot == null && editingBay == null && !flagBus && (
        <ShopMenu
          inShopCount={inShopCount}
          bays={sheet.lots?.bay || []}
          flags={flags}
          flagFor={flagFor}
          lotList={lotList}
          foundBus={foundBus}
          onEditLot={(key) => setEditingLot(key)}
          onEditBay={setEditingBay}
          onClearLot={requestClearLocation}
          onClearBays={() => requestClearLocation("bay")}
          onClose={() => setShopOpen(false)}
        />
      )}

      {/* One bay's spot, edited from the Shop menu */}
      {editingBay != null && !flagBus && (
        <CellEditor
          subLabel={`Bay ${editingBay + 1}`}
          value={(sheet.lots?.bay || [])[editingBay] || ""}
          flags={flags}
          cellId={`bay:${editingBay}`}
          locate={locateBus}
          onRelocate={relocateBus}
          blockable
          onEditFlags={(bus) => setFlagBus(bus)} /* stacks on top — Done returns here */
          onSave={(num) => {
            setBaySlot(editingBay, num);
            setEditingBay(null);
          }}
          onClose={() => setEditingBay(null)}
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
        <div className={`${chromeStyles.selectBar} no-print`}>
          <span className={chromeStyles.selectCount}>
            {selected.length ? `${selected.length} selected` : "Tap spots to select"}
          </span>
          {LOTS.map((l) => (
            <Button
              key={l.key}
              size="sm"
              isDisabled={!selected.length}
              onPress={() => bulkSendToLot(l.key)}
            >
              → {LOT_LOCATION_LABELS[l.key] || l.title}
            </Button>
          ))}
          <Button size="sm" isDisabled={!selected.length} onPress={() => setFlagPick("add")}>
            <Flag size={14} /> Add flag
          </Button>
          <Button size="sm" isDisabled={!selected.length} onPress={() => setFlagPick("remove")}>
            <FlagOff size={14} /> Remove flag
          </Button>
          <Button
            size="sm"
            isDisabled={!selected.length}
            onPress={bulkLockToggle}
            aria-label="Lock selected buses so they stay put when the grid is cleared"
          >
            <Lock size={14} /> Lock
          </Button>
          <Button
            size="sm"
            isDisabled={!selected.length}
            onPress={bulkBlockToggle}
            aria-label="Block selected empty spots with an X or reopen selected blocked spots"
          >
            <Ban size={14} /> Block
          </Button>
          <Button size="sm" variant="danger" isDisabled={!selected.length} onPress={bulkClearCells}>
            Clear
          </Button>
          <Button size="sm" onPress={exitSelectMode}>
            Done
          </Button>
        </div>
      )}

      {/* Which flag to add to / remove from every selected bus */}
      {flagPick && (
        <ResponsiveDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setFlagPick(null);
          }}
          title={flagPick === "add" ? "Add a flag" : "Remove a flag"}
          description={
            <>
              {flagPick === "add"
                ? `Applies to all ${selected.length} selected bus${selected.length === 1 ? "" : "es"}.`
                : `Removed from all ${selected.length} selected bus${selected.length === 1 ? "" : "es"}.`}
              {flagPick === "add"
                ? " Retorque needs tires and must be set per bus in Edit Flags."
                : ""}
            </>
          }
          size="md"
          footer={(close) => <Button onPress={close}>Cancel</Button>}
        >
          <div className={chromeStyles.flagPickList}>
            {(() => {
              const seen = new Set<string>();
              return departmentGroups().map((dept) => {
                const ids = dept.flags.filter((id) => {
                  if (seen.has(id)) return false;
                  if (flagPick === "add" && id === "retorque") return false;
                  seen.add(id);
                  return true;
                });
                if (!ids.length) return null;
                return (
                  <div className={chromeStyles.flagGroup} key={dept.id}>
                    <div className={chromeStyles.flagGroupTitle}>
                      <span className={chromeStyles.flagGroupDot} />
                      {dept.label}
                    </div>
                    <div className={chromeStyles.flagChips}>
                      {ids.map((id) => (
                        <Chip key={id} onPress={() => bulkFlag(id)}>
                          {flagName(id)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </ResponsiveDialog>
      )}

      <ConfirmDialog
        isOpen={confirmClear !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmClear(null);
        }}
        title={
          confirmClear?.kind === "location"
            ? `Clear ${confirmClear.label}?`
            : confirmClear?.kind === "lots"
              ? "Clear North, East, and Fence?"
              : "Clear the grid?"
        }
        description={
          confirmClear?.kind === "location"
            ? `This removes ${confirmClear.count} bus${confirmClear.count === 1 ? "" : "es"} from ${confirmClear.label} for everyone. The current sheet is saved first, and blocked bay spots remain blocked.`
            : confirmClear?.kind === "lots"
            ? "The current sheet is saved to Previous Sheets first. This clears only the three printed lots for everyone."
            : "The current sheet is saved to Previous Sheets first. Locked buses, blocked spots, and the back-of-sheet lots remain."
        }
        confirmLabel={confirmClear?.kind === "grid" ? "Clear grid" : "Clear buses"}
        tone="danger"
        onConfirm={async () => {
          if (!confirmClear) return;
          if (confirmClear.kind === "grid") await newSheet();
          else if (confirmClear.kind === "lots") await clearLots();
          else await clearLocation(confirmClear);
        }}
      />

      {/* Undo toast for the bigger actions (clears, drags, sends); plain notices reuse it */}
      {undoState && (
        <div className={`${chromeStyles.toast} no-print`} role="status">
          <span>{undoState.label}</span>
          {undoSheetRef.current && (
            <Button size="sm" onPress={undoNow}>
              Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
