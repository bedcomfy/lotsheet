"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cellLocationLabel, flagsFullDisplay } from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import CellEditor from "./CellEditor";
import LotEditor from "./LotEditorLazy";
import ManagerPanel from "./ManagerPanelLazy";
import { getDeviceActor } from "../lib/deviceActor";
import { useFlags } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import type { FlagEntry, FlagMap, LotKey } from "../lib/types";
import {
  AppPage,
  Button,
  ConfirmDialog,
  Pressable,
  ResponsiveDialog,
  SearchField,
  StaticChip,
  StatusBadge,
  Toolbar,
  ToolbarGroup,
} from "../ui";
import styles from "./ShopSheet.module.css";

// Everything "inside the shop" in one place: the Apron (buses parked anywhere on
// it — a simple list), the Bays (10 fixed spots, any of them can be empty), and
// Cards (a simple list too — no fixed spots; SCREEN-ONLY, never printed; also
// used as overflow parking, where the Ready for Service flag marks a finished bus).
const BAY_SPOTS = 10;

type ShopLots = Record<LotKey, string[]>;

// Lists editable from this page. Apron/Bays/Cards are the shop proper; the
// lane lists and R/C have no on-sheet editor (the Turnover paper manages them),
// so the Shop page hosts their editors too. Counts stay Apron+Bays+Cards only.
type EditableList = "apron" | "cards" | "northlane" | "southlane" | "rc";
type ShopClearTarget =
  | { kind: "lot"; key: EditableList | "bay"; label: string; count: number }
  | { kind: "offprop"; label: string; count: number; buses: string[] };
type ShopUndo =
  | { kind: "lot"; key: LotKey; value: string[]; label: string }
  | { kind: "offprop"; buses: string[]; label: string };

const LIST_EDITOR_COPY: Record<EditableList, { title: string; subtitle: string }> = {
  apron: { title: "Apron", subtitle: "Buses anywhere on the apron — the order shows on the Turnover sheet." },
  cards: { title: "Cards", subtitle: "No fixed spots — screen-only, never printed." },
  northlane: { title: "North Lane", subtitle: "Service lane list — shows on the Turnover sheet." },
  southlane: { title: "South Lane", subtitle: "Service lane list — shows on the Turnover sheet." },
  rc: { title: "R/C", subtitle: "Shared list — shows on the Turnover sheet." },
};

const EMPTY_LOTS: ShopLots = {
  north: [], east: [], fence: [], rc: [], apron: [],
  northlane: [], southlane: [], bay: [], cards: [],
};

const LOT_LABELS: Record<LotKey, string> = {
  north: "North Lot", east: "East Lot", fence: "Fence", rc: "R/C", apron: "Apron",
  northlane: "North Lane", southlane: "South Lane", bay: "Bay", cards: "Cards",
};

// Tolerate the old { num, ... } cell shape from earlier saved sheets.
function cellToNum(v: unknown): string {
  if (!v) return "";
  return typeof v === "string" ? v : (v as { num?: string }).num || "";
}

export default function ShopSheet() {
  const { label: busLabel, isKnown } = useBusMaster();
  const [lots, setLots] = useState<ShopLots>(EMPTY_LOTS);
  const [cellsSnap, setCellsSnap] = useState<Record<string, unknown>>({}); // grid cells, read-only (for locate)
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Universal flags come from the shared, deduplicated, live query cache.
  const { data: flags = {} } = useFlags();
  const qc = useQueryClient();
  const [flagBus, setFlagBus] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<EditableList | null>(null); // list editor
  const [offPropOpen, setOffPropOpen] = useState(false); // Off Property flag-list editor
  const [editingBay, setEditingBay] = useState<number | null>(null); // one fixed bay spot
  const [findVal, setFindVal] = useState("");
  const [clearTarget, setClearTarget] = useState<ShopClearTarget | null>(null);
  const [undoState, setUndoState] = useState<ShopUndo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lotDirty = useRef(false);
  const lotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lotsRef = useRef<ShopLots>(lots); // always-current, so chained edits never work from stale state
  const pendingClear = useRef<string[]>([]); // buses to strip from EVERYWHERE on the next PATCH
  const pendingLotKeys = useRef<Set<LotKey>>(new Set());
  const pendingClearKeys = useRef<Set<LotKey>>(new Set());
  const lotWriteVersion = useRef(0);

  // Shared sheet: load + poll (skip adopting while our own edit is in flight).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sheet", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d || !d.sheet || lotDirty.current) return;
          const s = d.sheet;
          const next: ShopLots = { ...EMPTY_LOTS };
          for (const k of Object.keys(EMPTY_LOTS) as LotKey[]) next[k] = s.lots?.[k] || [];
          setLots(next);
          lotsRef.current = next;
          setCellsSnap(s.cells || {});
        })
        .catch(() => {})
        .finally(() => alive && setLoaded(true));
    load();
    const iv = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  // Optimistically patch the shared flag cache so the just-edited pill updates
  // instantly; the /api/live pulse then reconciles with the server.
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

  function scheduleLotPatch(delay = 500) {
    clearTimeout(lotTimer.current);
    lotTimer.current = setTimeout(() => {
      const clearBuses = [...new Set(pendingClear.current)];
      pendingClear.current = [];
      const lotKeys = [...pendingLotKeys.current];
      const groupClears = [...pendingClearKeys.current];
      pendingLotKeys.current.clear();
      pendingClearKeys.current.clear();
      const changedLots = Object.fromEntries(lotKeys.map((key) => [key, lotsRef.current[key] || []]));
      const writeVersion = lotWriteVersion.current;
      fetch("/api/sheet", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: changedLots, clearKeys: groupClears, clearBuses, actor: getDeviceActor() }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Sheet save failed (${response.status})`);
          return response.json();
        })
        .then((d) => {
          if (
            writeVersion === lotWriteVersion.current
            && pendingLotKeys.current.size === 0
            && pendingClearKeys.current.size === 0
            && pendingClear.current.length === 0
          ) {
            lotDirty.current = false;
          }
          if (d.updatedAt) setSavedAt(new Date(d.updatedAt));
        })
        .catch(() => {
          // Retry the latest local value for every affected group. This stays
          // correct even if another edit happened while the failed request was
          // in flight: the newest value in lotsRef always wins.
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

  // Debounced PATCH of only the location keys this page changed. Sending the
  // whole lots object could overwrite a simultaneous edit in another group.
  function patchLots(next: ShopLots, changedKeys: LotKey[] = [], clearKeys: LotKey[] = []) {
    setLots(next);
    lotsRef.current = next;
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

  // Where a bus currently sits — grid cell (read-only here) or any lot.
  function locateBus(bus: string, exceptId: string | null): string {
    if (!bus) return "";
    for (const [id, v] of Object.entries(cellsSnap)) {
      if (cellToNum(v) === bus) return cellLocationLabel(id);
    }
    for (const [key, arr] of Object.entries(lotsRef.current)) {
      if (!Array.isArray(arr)) continue;
      const idx = arr.indexOf(bus);
      if (idx === -1) continue;
      if (exceptId === `${key}:${idx}`) continue; // the slot being edited
      const label = LOT_LABELS[key as LotKey] || key;
      // Bays are positional, so say exactly which one ("Bay 3").
      return key === "bay" ? `${label} ${idx + 1}` : label;
    }
    return "";
  }

  // Pull a bus out of wherever it sits so it can be placed here. Local state is
  // stripped immediately; the server strips grid cells too via clearBuses on
  // the same PATCH the destination rides in.
  function relocateBus(bus: string) {
    if (!bus) return;
    pendingClear.current.push(bus);
    setCellsSnap((c) => {
      const n = { ...c };
      for (const [id, v] of Object.entries(n)) if (cellToNum(v) === bus) delete n[id];
      return n;
    });
    const cur = lotsRef.current;
    const next = { ...cur };
    for (const k of Object.keys(next) as LotKey[]) {
      const arr = next[k] || [];
      if (!arr.includes(bus)) continue;
      next[k] = k === "bay" ? arr.map((b) => (b === bus ? "" : b)) : arr.filter((b) => b !== bus);
    }
    lotsRef.current = next;
    setLots(next);
  }

  // Set one fixed BAY spot to a bus (or "" / "X").
  function setBaySlot(i: number, num: string) {
    const cur = lotsRef.current;
    const arr = Array.from({ length: BAY_SPOTS }, (_, j) => (cur.bay || [])[j] || "");
    arr[i] = num;
    patchLots({ ...cur, bay: arr }, ["bay"]);
  }

  // List helpers for the free lots here (Apron and Cards — kept blank-free).
  const listOf = (key: EditableList) => (lots[key] || []).filter((b) => b);
  const addToList = (key: EditableList, bus: string) =>
    patchLots({ ...lotsRef.current, [key]: [...(lotsRef.current[key] || []).filter((b) => b), bus] }, [key]);
  const removeFromList = (key: EditableList, i: number) =>
    patchLots({ ...lotsRef.current, [key]: (lotsRef.current[key] || []).filter((b) => b).filter((_, j) => j !== i) }, [key]);
  function moveInList(key: EditableList, i: number, dir: number) {
    const arr = (lotsRef.current[key] || []).filter((b) => b);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchLots({ ...lotsRef.current, [key]: arr }, [key]);
  }
  function reorderInList(key: EditableList, from: number, to: number) {
    const arr = (lotsRef.current[key] || []).filter((b) => b);
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return;
    const [bus] = arr.splice(from, 1);
    arr.splice(to, 0, bus);
    patchLots({ ...lotsRef.current, [key]: arr }, [key]);
  }
  const apron = listOf("apron");
  const cards = listOf("cards");

  // The live search: the message is derived, so it stays up (and stays correct
  // as things move) until the box is cleared; the matching slot stays lit.
  const foundBus = findVal.length >= 4 ? findVal : "";
  const foundWhere = foundBus ? locateBus(foundBus, null) : "";

  // One fixed BAY slot button. Green when the bus is flagged Ready for Service
  // — done in the shop, waiting to go out. "X" = blocked spot.
  function slotButton(i: number) {
    const bus = (lots.bay || [])[i] || "";
    const xed = bus === "X";
    const entry = bus && !xed ? flags[bus] : undefined;
    // Full flags (hold reason, inspection option, the whole note) — they're the
    // most important info for a shop bus.
    const disp = entry ? flagsFullDisplay(entry) : "";
    const rfs = !!entry?.flags?.includes("rfs");
    const found = !!foundBus && bus === foundBus;
    return (
      <Pressable
        key={`bay-${i}`}
        className={`${styles.slot} ${bus && !xed ? styles.slotFilled : ""} ${xed ? styles.slotBlocked : ""} ${
          rfs ? styles.ready : ""
        } ${found ? styles.found : ""}`}
        onPress={() => setEditingBay(i)}
      >
        <span className={styles.slotLabel}>BAY {i + 1}</span>
        {xed ? (
          <span className={styles.slotX}>X</span>
        ) : bus ? (
          <>
            <span className={styles.slotBus}>{busLabel(bus)}</span>
            <TypeCodes num={bus} variant="ui" />
            {disp && <span className={styles.slotFlag}>{disp}</span>}
          </>
        ) : (
          <span className={styles.slotEmpty}>
            <Plus size={15} />
          </span>
        )}
      </Pressable>
    );
  }

  // Buses carrying the Off property flag (a flag, not a lot list). Sorted for a
  // stable card; deliberately NOT part of inShopCount.
  const offPropBuses = Object.entries(flags)
    .filter(([, entry]) => (entry.flags || []).includes("offprop"))
    .map(([bus]) => bus)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  async function saveOffProp(bus: string, on: boolean) {
    const liveFlags = qc.getQueryData<FlagMap>(["flags"]) || flags;
    const cur: FlagEntry = liveFlags[bus] || { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
    const has = (cur.flags || []).includes("offprop");
    if (on === has) return;
    const entry: FlagEntry = {
      ...cur,
      flags: on ? [...(cur.flags || []), "offprop"] : (cur.flags || []).filter((f) => f !== "offprop"),
    };
    onBusFlagsUpdated(bus, entry);
    await fetch("/api/flags", {
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
  }

  async function archiveCurrentSheet() {
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

  function offerUndo(next: ShopUndo) {
    setUndoState(next);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoState(null), 6000);
  }

  function requestClearLot(key: EditableList | "bay") {
    const label = key === "bay" ? "Bays" : LIST_EDITOR_COPY[key].title;
    const count = (lotsRef.current[key] || []).filter((bus) => bus && bus !== "X").length;
    if (!count) return;
    setEditingList(null);
    setEditingBay(null);
    setClearTarget({ kind: "lot", key, label, count });
  }

  function requestClearOffProperty() {
    if (!offPropBuses.length) return;
    setOffPropOpen(false);
    setClearTarget({ kind: "offprop", label: "Off Property", count: offPropBuses.length, buses: offPropBuses });
  }

  async function confirmGroupClear() {
    if (!clearTarget) return;
    if (clearTarget.kind === "lot") {
      await archiveCurrentSheet();
      const previous = [...(lotsRef.current[clearTarget.key] || [])];
      const value = clearTarget.key === "bay"
        ? previous.map((bus) => (bus === "X" ? "X" : ""))
        : [];
      offerUndo({ kind: "lot", key: clearTarget.key, value: previous, label: `${clearTarget.label} cleared` });
      patchLots({ ...lotsRef.current, [clearTarget.key]: value }, [], [clearTarget.key]);
      return;
    }

    offerUndo({ kind: "offprop", buses: clearTarget.buses, label: "Off Property cleared" });
    await Promise.all(clearTarget.buses.map((bus) => saveOffProp(bus, false)));
  }

  async function undoClear() {
    if (!undoState) return;
    if (undoState.kind === "lot") {
      patchLots({ ...lotsRef.current, [undoState.key]: [...undoState.value] }, [undoState.key]);
    } else {
      await Promise.all(undoState.buses.map((bus) => saveOffProp(bus, true)));
    }
    setUndoState(null);
    clearTimeout(undoTimer.current);
  }

  const inShopCount = new Set(
    [...apron, ...cards, ...(lots.bay || [])].filter((b) => b && b !== "X")
  ).size;

  return (
    <AppPage className={`${styles.page} no-print`}>
      <Toolbar className="no-print" aria-label="Shop controls">
        <ToolbarGroup>
          <StaticChip tone="accent">{inShopCount} in the shop</StaticChip>
        </ToolbarGroup>
      </Toolbar>

      {/* Screen-only — nothing on this page prints. */}
      <div className={styles.shop}>
        <section
          className={`${styles.shopCard} ${styles.shopCardInteractive}`}
          role="button"
          tabIndex={0}
          onClick={() => setEditingList("apron")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditingList("apron");
            }
          }}
        >
          <div className={styles.cardHead}>
            APRON <span className={styles.cardCount}>({apron.length})</span>
            <span className={styles.cardEdit}>Edit</span>
          </div>
          <div className={styles.cardSub}>Buses anywhere on the apron — tap to add or manage.</div>
          <div className={styles.busChips}>
            {apron.length === 0 && <span className={styles.empty}>No buses on the apron.</span>}
            {apron.map((bus, i) => {
              const f = flagsFullDisplay(flags[bus]);
              return (
                <span className={`${styles.busChip} ${!!foundBus && bus === foundBus ? styles.found : ""}`} key={`${bus}-${i}`}>
                  {busLabel(bus)}
                  <TypeCodes num={bus} variant="ui" />
                  {f && <span className={styles.busFlags}>{f}</span>}
                </span>
              );
            })}
          </div>
        </section>

        <section className={styles.shopCard}>
          <div className={styles.cardHead}>
            BAYS <span className={styles.cardCount}>({(lots.bay || []).filter((bus) => bus && bus !== "X").length})</span>
            <Button
              className={styles.cardAction}
              size="sm"
              variant="danger"
              isDisabled={!(lots.bay || []).some((bus) => bus && bus !== "X")}
              onPress={() => requestClearLot("bay")}
            >
              <Trash2 aria-hidden="true" /> Clear buses
            </Button>
          </div>
          <div className={styles.cardSub}>Tap a bay to set or change its bus — any bay can be empty.</div>
          <div className={styles.slots}>{Array.from({ length: BAY_SPOTS }, (_, i) => slotButton(i))}</div>
        </section>

        <section
          className={`${styles.shopCard} ${styles.shopCardInteractive} ${styles.shopCardWide}`}
          role="button"
          tabIndex={0}
          onClick={() => setEditingList("cards")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditingList("cards");
            }
          }}
        >
          <div className={styles.cardHead}>
            CARDS <span className={styles.cardCount}>({cards.length})</span>
            <span className={styles.cardEdit}>Edit</span>
            <span className={styles.legend}>
              <span className={styles.legendDot} /> Ready for Service
            </span>
          </div>
          <div className={styles.cardSub}>
            No fixed spots — screen-only, never printed. Also overflow parking; green = Ready for Service.
          </div>
          <div className={styles.busChips}>
            {cards.length === 0 && <span className={styles.empty}>No buses in cards.</span>}
            {cards.map((bus, i) => {
              const rfs = !!flags[bus]?.flags?.includes("rfs");
              const f = flagsFullDisplay(flags[bus]);
              return (
                <span
                  className={`${styles.busChip} ${rfs ? styles.ready : ""} ${!!foundBus && bus === foundBus ? styles.found : ""}`}
                  key={`${bus}-${i}`}
                >
                  {busLabel(bus)}
                  <TypeCodes num={bus} variant="ui" />
                  {f && <span className={styles.busFlags}>{f}</span>}
                </span>
              );
            })}
          </div>
        </section>
      </div>

      {/* Lists with no on-sheet editor — editable here; NOT counted in "in the
          shop" (that stays Apron + Bays + Cards). */}
      <div className={styles.shopSecondary}>
        {(["northlane", "southlane", "rc"] as const).map((key) => {
          const list = listOf(key);
          return (
            <section
              key={key}
              className={`${styles.shopCard} ${styles.shopCardInteractive}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditingList(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditingList(key);
                }
              }}
            >
              <div className={styles.cardHead}>
                {LIST_EDITOR_COPY[key].title.toUpperCase()}{" "}
                <span className={styles.cardCount}>({list.length})</span>
                <span className={styles.cardEdit}>Edit</span>
              </div>
              <div className={styles.busChips}>
                {list.length === 0 && <span className={styles.empty}>Empty.</span>}
                {list.map((bus, i) => (
                  <span className={styles.busChip} key={`${bus}-${i}`}>
                    {busLabel(bus)}
                    <TypeCodes num={bus} variant="ui" />
                  </span>
                ))}
              </div>
            </section>
          );
        })}

        <section
          className={`${styles.shopCard} ${styles.shopCardInteractive}`}
          role="button"
          tabIndex={0}
          onClick={() => setOffPropOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOffPropOpen(true);
            }
          }}
        >
          <div className={styles.cardHead}>
            OFF PROPERTY{" "}
            <span className={styles.cardCount}>({offPropBuses.length})</span>
            <span className={styles.cardEdit}>Edit</span>
          </div>
          <div className={styles.busChips}>
            {offPropBuses.length === 0 && <span className={styles.empty}>No buses off property.</span>}
            {offPropBuses.map((bus) => (
              <span className={styles.busChip} key={bus}>
                {busLabel(bus)}
                <TypeCodes num={bus} variant="ui" />
              </span>
            ))}
          </div>
        </section>
      </div>

      {offPropOpen && (
        <OffPropertyEditor
          buses={offPropBuses}
          flags={flags}
          isKnown={isKnown}
          label={busLabel}
          onChange={saveOffProp}
          onClearRequest={requestClearOffProperty}
          onClose={() => setOffPropOpen(false)}
        />
      )}

      {editingBay != null && !flagBus && (
        <CellEditor
          subLabel={`Bay ${editingBay + 1}`}
          value={(lots.bay || [])[editingBay] || ""}
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

      {editingList && !flagBus && (
        <LotEditor
          title={LIST_EDITOR_COPY[editingList].title}
          subtitle={LIST_EDITOR_COPY[editingList].subtitle}
          list={listOf(editingList)}
          flags={flags}
          locate={locateBus}
          onRelocate={relocateBus}
          onEditFlags={(bus) => setFlagBus(bus)}
          onAdd={(bus) => addToList(editingList, bus)}
          onRemove={(i) => removeFromList(editingList, i)}
          onMove={(i, dir) => moveInList(editingList, i, dir)}
          onReorder={(from, to) => reorderInList(editingList, from, to)}
          onClearRequest={() => requestClearLot(editingList)}
          onClose={() => setEditingList(null)}
        />
      )}

      {flagBus && (
        <ManagerPanel
          flags={flags}
          initialBus={flagBus}
          onBusFlagsUpdated={onBusFlagsUpdated}
          onClose={() => setFlagBus(null)}
        />
      )}

      <ConfirmDialog
        isOpen={clearTarget !== null}
        onOpenChange={(open) => {
          if (!open) setClearTarget(null);
        }}
        title={`Clear ${clearTarget?.label || "location"}?`}
        description={
          clearTarget
            ? `This removes ${clearTarget.count} bus${clearTarget.count === 1 ? "" : "es"} from ${clearTarget.label} for everyone. Other locations are not changed${clearTarget.kind === "lot" && clearTarget.key === "bay" ? ", and blocked bay spots remain blocked" : ""}.`
            : ""
        }
        confirmLabel="Clear buses"
        tone="danger"
        onConfirm={confirmGroupClear}
      />

      {undoState && (
        <div className={styles.toast} role="status">
          <span>{undoState.label}</span>
          <Button size="sm" onPress={undoClear}>Undo</Button>
        </div>
      )}
    </AppPage>
  );
}

// Small editor for the Off property flag list: add a bus by number, remove
// with one tap. Writes the same /api/flags entries the flag editor writes.
function OffPropertyEditor({
  buses,
  flags,
  isKnown,
  label,
  onChange,
  onClearRequest,
  onClose,
}: {
  buses: string[];
  flags: FlagMap;
  isKnown: (bus: string) => boolean;
  label: (bus: string) => string;
  onChange: (bus: string, on: boolean) => void | Promise<void>;
  onClearRequest: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  function add() {
    const bus = sanitizeBus(value);
    if (!bus || !isKnown(bus)) return;
    onChange(bus, true);
    setValue("");
  }

  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Off Property"
      description="Buses tracked away from the garage. Adding or removing sets the Off property flag."
      size="sm"
      footer={(close) => (
        <>
          <Button
            className={styles.clearButton}
            variant="danger"
            isDisabled={buses.length === 0}
            onPress={onClearRequest}
          >
            <Trash2 aria-hidden="true" /> Clear Off Property
          </Button>
          <Button variant="primary" onPress={close}>
            Done
          </Button>
        </>
      )}
    >
      <div className={styles.offPropAdd}>
        <SearchField
          label="Add bus"
          labelHidden
          placeholder="Bus number…"
          inputMode="numeric"
          value={value}
          onChange={(v) => setValue(sanitizeBus(v))}
          onKeyDown={(e) => e.key === "Enter" && add()}
          errorMessage={value.length >= 4 && !isKnown(value) ? `“${value}” isn't a known bus.` : undefined}
        />
        <Button variant="primary" isDisabled={!isKnown(value)} onPress={add}>
          Add
        </Button>
      </div>
      <div className={styles.offPropList}>
        {buses.length === 0 && <span className={styles.empty}>No buses off property.</span>}
        {buses.map((bus) => (
          <div className={styles.offPropRow} key={bus}>
            <span className={styles.slotBus}>{label(bus)}</span>
            <span className={styles.busFlags}>{flagsFullDisplay(flags[bus])}</span>
            <Button size="sm" variant="quiet" onPress={() => onChange(bus, false)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
