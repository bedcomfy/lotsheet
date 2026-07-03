"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus } from "lucide-react";
import { cellLocationLabel, flagDisplay, flagsFullDisplay } from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import CellEditor from "./CellEditor";
import LotEditor from "./LotEditor";
import ManagerPanel from "./ManagerPanel";
import type { FlagEntry, FlagMap, LotKey } from "../lib/types";

// Everything "inside the shop" in one place: the Apron (buses parked anywhere on
// it — a simple list), the Bays (10 fixed spots, any of them can be empty), and
// Cards (12 fixed spots — SCREEN-ONLY, never printed; also used as overflow
// parking, where the Ready for Service flag marks a finished bus).
const BAY_SPOTS = 10;
const CARD_SPOTS = 12;

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
  const { label: busLabel, isKnown } = useBusMaster();
  const [lots, setLots] = useState<ShopLots>(EMPTY_LOTS);
  const [cellsSnap, setCellsSnap] = useState<Record<string, unknown>>({}); // grid cells, read-only (for locate)
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [flags, setFlags] = useState<FlagMap>({});
  const [flagBus, setFlagBus] = useState<string | null>(null);
  const [apronOpen, setApronOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ key: "bay" | "cards"; i: number } | null>(null);
  const [findVal, setFindVal] = useState("");
  const [findMsg, setFindMsg] = useState("");
  const findMsgTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lotDirty = useRef(false);
  const lotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lotsRef = useRef<ShopLots>(lots); // always-current, so chained edits never work from stale state
  const pendingClear = useRef<string[]>([]); // buses to strip from EVERYWHERE on the next PATCH

  // Shared sheet: load + poll (skip adopting while our own edit is in flight).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sheet")
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
    const iv = setInterval(load, 4000);
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
      return LOT_LABELS[key as LotKey] || key;
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
      next[k] = k === "bay" || k === "cards" ? arr.map((b) => (b === bus ? "" : b)) : arr.filter((b) => b !== bus);
    }
    lotsRef.current = next;
    setLots(next);
  }

  // Set one fixed slot (bay/cards) to a bus (or "" to clear it).
  function setSlot(key: "bay" | "cards", spots: number, i: number, num: string) {
    const cur = lotsRef.current;
    const arr = Array.from({ length: spots }, (_, j) => (cur[key] || [])[j] || "");
    arr[i] = num;
    patchLots({ ...cur, [key]: arr });
  }

  // Apron list helpers (same behavior as the other lot lists).
  const apron = lots.apron || [];
  const addToApron = (bus: string) => patchLots({ ...lotsRef.current, apron: [...(lotsRef.current.apron || []), bus] });
  const removeFromApron = (i: number) =>
    patchLots({ ...lotsRef.current, apron: (lotsRef.current.apron || []).filter((_, j) => j !== i) });
  function moveInApron(i: number, dir: number) {
    const arr = [...(lotsRef.current.apron || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchLots({ ...lotsRef.current, apron: arr });
  }
  function reorderInApron(from: number, to: number) {
    const arr = [...(lotsRef.current.apron || [])];
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return;
    const [bus] = arr.splice(from, 1);
    arr.splice(to, 0, bus);
    patchLots({ ...lotsRef.current, apron: arr });
  }

  function findBus(raw?: string) {
    const v = sanitizeBus(raw ?? findVal);
    if (v.length < 4) return;
    const where = locateBus(v, null);
    clearTimeout(findMsgTimer.current);
    setFindMsg(where || "Not placed anywhere");
    findMsgTimer.current = setTimeout(() => setFindMsg(""), 3000);
  }

  // One fixed slot button (Bay n / Card n). Green when the bus is flagged
  // Ready for Service — done in the shop, waiting to go out.
  function slotButton(key: "bay" | "cards", spots: number, i: number) {
    const bus = (lots[key] || [])[i] || "";
    const entry = bus ? flags[bus] : undefined;
    const disp = entry ? flagDisplay(entry) : "";
    const rfs = !!entry?.flags?.includes("rfs");
    return (
      <button
        key={`${key}-${i}`}
        type="button"
        className={`shopslot ${bus ? "shopslot--filled" : ""} ${rfs ? "shopslot--rfs" : ""}`}
        onClick={() => setEditingSlot({ key, i })}
      >
        <span className="shopslot__label">
          {key === "bay" ? "BAY" : "CARD"} {i + 1}
        </span>
        {bus ? (
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
    [...apron, ...(lots.bay || []), ...(lots.cards || [])].filter(Boolean)
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
            onChange={(e) => {
              const v = sanitizeBus(e.target.value);
              setFindVal(v);
              setFindMsg("");
              if (isKnown(v)) findBus(v);
            }}
            onKeyDown={(e) => e.key === "Enter" && findBus()}
          />
          {findMsg && <span className="findbox__msg">{findMsg}</span>}
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
          onClick={() => setApronOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setApronOpen(true);
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
            {apron.map((bus, i) => (
              <span className="apronchip" key={`${bus}-${i}`}>
                {busLabel(bus)}
                <TypeCodes num={bus} />
              </span>
            ))}
          </div>
        </section>

        <section className="shopcard">
          <div className="shopcard__head">BAYS</div>
          <div className="shopcard__sub">Tap a bay to set or change its bus — any bay can be empty.</div>
          <div className="shopslots">
            {Array.from({ length: BAY_SPOTS }, (_, i) => slotButton("bay", BAY_SPOTS, i))}
          </div>
        </section>

        <section className="shopcard shopcard--wide">
          <div className="shopcard__head">
            CARDS
            <span className="shopcard__legend">
              <span className="shopcard__legenddot" /> Ready for Service
            </span>
          </div>
          <div className="shopcard__sub">
            Screen-only — never printed. Also used as overflow parking; flag a finished bus Ready for Service.
          </div>
          <div className="shopslots">
            {Array.from({ length: CARD_SPOTS }, (_, i) => slotButton("cards", CARD_SPOTS, i))}
          </div>
        </section>
      </div>

      {editingSlot && (
        <CellEditor
          subLabel={`${editingSlot.key === "bay" ? "Bay" : "Card"} ${editingSlot.i + 1}`}
          value={(lots[editingSlot.key] || [])[editingSlot.i] || ""}
          flags={flags}
          cellId={`${editingSlot.key}:${editingSlot.i}`}
          locate={locateBus}
          onRelocate={relocateBus}
          onEditFlags={(bus) => {
            setEditingSlot(null);
            setFlagBus(bus);
          }}
          onSave={(num) => {
            const spots = editingSlot.key === "bay" ? BAY_SPOTS : CARD_SPOTS;
            setSlot(editingSlot.key, spots, editingSlot.i, num);
            setEditingSlot(null);
          }}
          onClose={() => setEditingSlot(null)}
        />
      )}

      {apronOpen && (
        <LotEditor
          title="Apron"
          subtitle="Buses anywhere on the apron — the order shows on the Turnover sheet."
          list={apron}
          flags={flags}
          locate={locateBus}
          onRelocate={relocateBus}
          onEditFlags={(bus) => setFlagBus(bus)}
          onAdd={addToApron}
          onRemove={removeFromApron}
          onMove={moveInApron}
          onReorder={reorderInApron}
          onClose={() => setApronOpen(false)}
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
