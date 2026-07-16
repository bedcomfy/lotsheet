"use client";

// Tonight — the live status board: how's the night going, in one glance.
// Same numbers as the desktop Home/Lot chips (fleetStats is the one shared
// definition of the fleet totals).

import { useMemo } from "react";
import { useLotSheet, useFlags, useBusMasterList } from "../../lib/queries";
import { fleetStats } from "../../lib/fleetStats";

interface MTonightProps {
  onGo: (tab: string) => void;
  onOpenBus: (bus: string) => void;
}

export default function MTonight({ onGo, onOpenBus }: MTonightProps) {
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { data: masterBuses = [] } = useBusMasterList();
  const sheet = sheetData?.sheet || null;

  const fleet = useMemo(() => fleetStats(sheet, flags, masterBuses), [sheet, flags, masterBuses]);
  const activeCount = useMemo(
    () => masterBuses.filter((b) => b.status !== "retired").length,
    [masterBuses]
  );
  const flaggedCount = useMemo(
    () => Object.values(flags).filter((e) => (e.flags || []).length > 0).length,
    [flags]
  );
  const placed = fleet.onGrid.size;
  const inShop = fleet.inShop.size;
  const pct = (n: number, total: number) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0);

  return (
    <>
      <div className="mstats">
        <div className="mstat mstat--ok"><b>{fleet.readyForService.size}</b><span>USABLE</span></div>
        <div className="mstat mstat--bad"><b>{fleet.notReadyForService.size}</b><span>OUT OF SERVICE</span></div>
      </div>

      {fleet.missing.length > 0 && (
        <button type="button" className="mbanner" onClick={() => onOpenBus(fleet.missing[0])}>
          <i></i>
          <b>{fleet.missing.length} missing</b>
          <span>· {fleet.missing.slice(0, 4).join(", ")}{fleet.missing.length > 4 ? "…" : ""}</span>
          <span className="go">›</span>
        </button>
      )}

      <div className="mapp__sec">Tonight's work</div>
      <div className="mprog">
        <div className="mprog__row">
          <span>Lot placed</span>
          <div className="mbar"><i style={{ width: `${pct(placed, activeCount)}%` }} /></div>
          <b>{placed}/{activeCount}</b>
        </div>
        <div className="mprog__row">
          <span>In shop</span>
          <div className="mbar"><i className="warn" style={{ width: `${pct(inShop, Math.max(activeCount, 1))}%` }} /></div>
          <b>{inShop}</b>
        </div>
        <div className="mprog__row">
          <span>Flagged</span>
          <div className="mbar"><i className="bad" style={{ width: `${pct(flaggedCount, Math.max(activeCount, 1))}%` }} /></div>
          <b>{flaggedCount}</b>
        </div>
      </div>

      <div className="mapp__sec">Jump in</div>
      <div className="mquick">
        <button type="button" className="mquickbtn mquickbtn--hot" onClick={() => onGo("lot")}>
          <span className="em">🅿️</span>Walk the lot<small>Two rows at a time</small>
        </button>
        <button type="button" className="mquickbtn" onClick={() => onGo("buses")}>
          <span className="em">🚌</span>Find a bus<small>Flags &amp; location</small>
        </button>
      </div>
    </>
  );
}
