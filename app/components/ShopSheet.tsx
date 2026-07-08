"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { cellLocationLabel, flagsFullDisplay } from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import CellEditor from "./CellEditor";
import LotEditor from "./LotEditor";
import ManagerPanel from "./ManagerPanel";
import type { FlagEntry, FlagMap, LotKey } from "../lib/types";

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
  const [flags, setFlags] = useState<FlagMap>({});
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

  // Universal flags: load + poll.
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
        body: JSON.stringify({ lots: lotsRef.current, clearBuses }),
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
      <button
        key={`bay-${i}`}
        type="button"
        className={`shopslot ${bus && !xed ? "shopslot--filled" : ""} ${xed ? "shopslot--blocked" : ""} ${
          rfs ? "shopslot--rfs" : ""
        } ${found ? "shopslot--found" : ""}`}
        onClick={() => setEditingBay(i)}
      >
        <span className="shopslot__label">BAY {i + 1}</span>
        {xed ? (
          <span className="shopslot__x">X</span>
        ) : bus ? (
          <>
            <span className="shopslot__bus">{busLabel(bus)}</span>
            <TypeCodes num={bus} />
            {disp && <span className="shopslot__flag">{disp}</span>}
          </>
        ) : (
          <span className="shopslot__empty">
            <Plus size={15} />
          </span>
        )}
      </button>
    );
  }

  const inShopCount = new Set(
    [...apron, ...cards, ...(lots.bay || [])].filter((b) => b && b !== "X")
  ).size;

  return (
    <div className="app">
      <div className="toolbar no-print">
        <div className="toolbar__title">Shop</div>
        <div className="findbox" title="Type a bus number to see where it is">
          <Search size={15} />
          <input
            className="findbox__in"
            placeholder="Find bus"
            inputMode="numeric"
            value={findVal}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setFindVal(sanitizeBus(e.target.value))}
          />
          {foundBus && <span className="findbox__msg">{foundWhere || "Not placed anywhere"}</span>}
          {findVal && (
            <button className="findbox__clear" onClick={() => setFindVal("")} aria-label="Clear search" title="Clear">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="toolbar__spacer" />
        <span className="statchip">{inShopCount} in the shop</span>
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
        </span>
      </div>

      {/* Screen-only — nothing on this page prints. */}
      <div className="shop no-print">
        <section
          className="shopcard shopcard--btn"
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
          <div className="shopcard__head">
            APRON <span className="shopcard__count">({apron.length})</span>
            <span className="backlot__edit"> ✎ edit</span>
          </div>
          <div className="shopcard__sub">Buses anywhere on the apron — tap to add or manage.</div>
          <div className="apronchips">
            {apron.length === 0 && <span className="apronchips__empty">No buses on the apron.</span>}
            {apron.map((bus, i) => {
              const f = flagsFullDisplay(flags[bus]);
              return (
                <span className={`apronchip ${!!foundBus && bus === foundBus ? "apronchip--found" : ""}`} key={`${bus}-${i}`}>
                  {busLabel(bus)}
                  <TypeCodes num={bus} />
                  {f && <span className="apronchip__flags">{f}</span>}
                </span>
              );
            })}
          </div>
        </section>

        <section className="shopcard">
          <div className="shopcard__head">BAYS</div>
          <div className="shopcard__sub">Tap a bay to set or change its bus — any bay can be empty.</div>
          <div className="shopslots">{Array.from({ length: BAY_SPOTS }, (_, i) => slotButton(i))}</div>
        </section>

        <section
          className="shopcard shopcard--btn shopcard--wide"
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
          <div className="shopcard__head">
            CARDS <span className="shopcard__count">({cards.length})</span>
            <span className="backlot__edit"> ✎ edit</span>
            <span className="shopcard__legend">
              <span className="shopcard__legenddot" /> Ready for Service
            </span>
          </div>
          <div className="shopcard__sub">
            No fixed spots — screen-only, never printed. Also overflow parking; green = Ready for Service.
          </div>
          <div className="apronchips">
            {cards.length === 0 && <span className="apronchips__empty">No buses in cards.</span>}
            {cards.map((bus, i) => {
              const rfs = !!flags[bus]?.flags?.includes("rfs");
              const f = flagsFullDisplay(flags[bus]);
              return (
                <span
                  className={`apronchip ${rfs ? "apronchip--rfs" : ""} ${!!foundBus && bus === foundBus ? "apronchip--found" : ""}`}
                  key={`${bus}-${i}`}
                >
                  {busLabel(bus)}
                  <TypeCodes num={bus} />
                  {f && <span className="apronchip__flags">{f}</span>}
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
    </div>
  );
}
