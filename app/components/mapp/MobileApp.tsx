"use client";

// The phone app shell (/m): top bar, five tabs, the shared Bus Card, and a
// toast. Purpose-built for phones — its own navigation and views, the exact
// same live data as desktop (shared query cache + the /api/live pulse).

import { useEffect, useMemo, useRef, useState } from "react";
import { useLotSheet, useFlags, useBusMasterList } from "../../lib/queries";
import { fleetStats } from "../../lib/fleetStats";
import { chicagoLotStamp } from "../../lib/chicagoTime";

// Set after mount (not during SSR) so the server and client renders match.
function useClock(): string {
  const [text, setText] = useState("");
  useEffect(() => {
    const tick = () => {
      const stamp = chicagoLotStamp();
      setText(`${stamp.date} · ${stamp.time}`);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);
  return text;
}
import MTonight from "./MTonight";
import MBuses, { pushRecent } from "./MBuses";
import MWalk from "./MWalk";
import MShop from "./MShop";
import MMore from "./MMore";
import MBusCard from "./MBusCard";
import { useKeyboardInset } from "./useKeyboardInset";

type Tab = "tonight" | "buses" | "lot" | "shop" | "more";
const TITLES: Record<Tab, string> = { tonight: "Tonight", buses: "Buses", lot: "The Walk", shop: "Shop", more: "More" };
const TABS: { id: Tab; em: string; label: string }[] = [
  { id: "tonight", em: "🏠", label: "Tonight" },
  { id: "buses", em: "🚌", label: "Buses" },
  { id: "lot", em: "🅿️", label: "Lot" },
  { id: "shop", em: "🔧", label: "Shop" },
  { id: "more", em: "≡", label: "More" },
];

export default function MobileApp() {
  const clock = useClock();
  useKeyboardInset(); // publish --mkb app-wide (Bus Card, Move sheet, dock)
  const [tab, setTab] = useState<Tab>("tonight");
  const [openBus, setOpenBus] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewRef = useRef<HTMLDivElement>(null);

  // Hide the desktop chrome while the app is mounted (CSS keys off this flag).
  useEffect(() => {
    document.body.dataset.mapp = "1";
    return () => { delete document.body.dataset.mapp; };
  }, []);

  // Live counts for the top-bar pill.
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { data: masterBuses = [] } = useBusMasterList();
  const fleet = useMemo(
    () => fleetStats(sheetData?.sheet || null, flags, masterBuses),
    [sheetData, flags, masterBuses]
  );

  function toast(msg: string) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2100);
  }

  function show(next: Tab) {
    setTab(next);
    viewRef.current?.scrollTo({ top: 0 });
  }

  function openBusCard(bus: string) {
    // Close the iOS keyboard first — a bottom-sheet card must never open
    // underneath it (the exact bug this replaces).
    (document.activeElement as HTMLElement | null)?.blur?.();
    setOpenBus(bus);
    pushRecent(bus);
  }

  return (
    <div className="mapp">
      <div className="mapp__top">
        <span className="mapp__logo">PNW</span>
        <div className="mapp__title">
          <b>{TITLES[tab]}</b>
          <span>{clock}</span>
        </div>
        <span className="mapp__live" title="Synced live with the whole garage">
          <i></i>{fleet.readyForService.size} usable
        </span>
      </div>

      <div className="mapp__view" ref={viewRef}>
        {tab === "tonight" && <MTonight onGo={(t) => show(t as Tab)} onOpenBus={openBusCard} />}
        {tab === "buses" && <MBuses onOpenBus={openBusCard} />}
        {tab === "lot" && <MWalk toast={toast} />}
        {tab === "shop" && <MShop onOpenBus={openBusCard} />}
        {tab === "more" && <MMore />}
      </div>

      <div className="mtabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`mtab ${tab === t.id ? "mtab--on" : ""}`}
            onClick={() => show(t.id)}
          >
            <span className="em">{t.em}</span>
            {t.label}
          </button>
        ))}
      </div>

      {openBus && <MBusCard bus={openBus} onClose={() => setOpenBus(null)} toast={toast} />}
      {toastMsg && (
        <div className="mtoast" role="status">
          <b>✓</b>&nbsp;{toastMsg}
        </div>
      )}
    </div>
  );
}
