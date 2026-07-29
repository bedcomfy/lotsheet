"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
  AppPage,Pressable,
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
  const { label: busLabel } = useBusMaster();
  const [lots, setLots] = useState<ShopLots>(EMPTY_LOTS);
  const [cellsSnap, setCellsSnap] = useState<Record<string, unknown>>({}); // grid cells, read-only (for locate)
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Universal flags come from the shared, deduplicated, live query cache.
  const { data: flags = {} } = useFlags();
  const qc = useQueryClient();
  const [flagBus, setFlagBus] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<"apron" | "cards" | null>(null); // list editor (Apron / Cards)
  const [editingBay, setEditingBay] = useState<number | null>(null); // one fixed bay spot
  const [findVal, setFindVal] = useState("");

  const lotDirty = useRef(false);
  const lotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lotsRef = useRef<ShopLots>(lots); // always-current, so chained edits never work from stale state
  const pendingClear = useRef<string[]>([]); // buses to strip from EVERYWHERE on the next PATCH

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

  // Debounced PATCH of the lots (+ any pending "strip this bus from everywhere"
  // clears, applied server-side BEFORE the merge so moves can't race).
  function patchLots(next: ShopLots) {
    setLots(next);
    lotsRef.current = next;
    lotDirty.current = true;
    clearTimeout(lotTimer.current);
    lotTimer.current = setTimeout(() => {
      const clearBuses = pendingClear.current;
      pendingClear.current = [];
      fetch("/api/sheet", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: lotsRef.current, clearBuses, actor: getDeviceActor() }),
      })
        .then((r) => r.json())
        .then((d) => {
          lotDirty.current = false;
          if (d.updatedAt) setSavedAt(new Date(d.updatedAt));
        })
        .catch(() => {
          lotDirty.current = false;
        });
    }, 500);
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
    patchLots({ ...cur, bay: arr });
  }

  // List helpers for the free lots here (Apron and Cards — kept blank-free).
  const listOf = (key: "apron" | "cards") => (lots[key] || []).filter((b) => b);
  const addToList = (key: "apron" | "cards", bus: string) =>
    patchLots({ ...lotsRef.current, [key]: [...(lotsRef.current[key] || []).filter((b) => b), bus] });
  const removeFromList = (key: "apron" | "cards", i: number) =>
    patchLots({ ...lotsRef.current, [key]: (lotsRef.current[key] || []).filter((b) => b).filter((_, j) => j !== i) });
  function moveInList(key: "apron" | "cards", i: number, dir: number) {
    const arr = (lotsRef.current[key] || []).filter((b) => b);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchLots({ ...lotsRef.current, [key]: arr });
  }
  function reorderInList(key: "apron" | "cards", from: number, to: number) {
    const arr = (lotsRef.current[key] || []).filter((b) => b);
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return;
    const [bus] = arr.splice(from, 1);
    arr.splice(to, 0, bus);
    patchLots({ ...lotsRef.current, [key]: arr });
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

  const inShopCount = new Set(
    [...apron, ...cards, ...(lots.bay || [])].filter((b) => b && b !== "X")
  ).size;

  return (
    <AppPage className={`${styles.page} no-print`}>
      <Toolbar className="no-print" aria-label="Shop controls">
        <ToolbarGroup>
          <StaticChip tone="accent">{inShopCount} in the shop</StaticChip>
          <span className={styles.saved}>
            {savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : loaded
                ? "Up to date"
                : "Loading"}
          </span>
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
          <div className={styles.cardHead}>BAYS</div>
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

      {editingBay != null && (
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

      {editingList && (
        <LotEditor
          title={editingList === "apron" ? "Apron" : "Cards"}
          subtitle={
            editingList === "apron"
              ? "Buses anywhere on the apron — the order shows on the Turnover sheet."
              : "No fixed spots — screen-only, never printed."
          }
          list={listOf(editingList)}
          flags={flags}
          locate={locateBus}
          onRelocate={relocateBus}
          onEditFlags={(bus) => setFlagBus(bus)}
          onAdd={(bus) => addToList(editingList, bus)}
          onRemove={(i) => removeFromList(editingList, i)}
          onMove={(i, dir) => moveInList(editingList, i, dir)}
          onReorder={(from, to) => reorderInList(editingList, from, to)}
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
    </AppPage>
  );
}
