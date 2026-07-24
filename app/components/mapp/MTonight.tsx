"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BusFront,
  CheckCircle2,
  ClipboardList,
  Flag,
  MapPinned,
  Search,
  Warehouse,
  Wrench,
} from "lucide-react";
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
  const flaggedCount = useMemo(
    () => Object.values(flags).filter((entry) => (entry.flags || []).length > 0 || entry.note).length,
    [flags]
  );

  const locations = [
    { label: "On grid", value: fleet.onGrid.size, icon: ClipboardList, tone: "blue" },
    { label: "In lots", value: fleet.inLots.size, icon: MapPinned, tone: "amber" },
    { label: "In shop", value: fleet.inShop.size, icon: Wrench, tone: "purple" },
    { label: "Off property", value: fleet.offProperty.size, icon: Warehouse, tone: "slate" },
  ];

  return (
    <div className="mtonight">
      <section className="mtonight__hero">
        <span className="mtonight__eyebrow"><i /> Live operations</span>
        <h1>Maintenance Logistics</h1>
        <p>Fleet readiness and garage placement, updated from the working sheets.</p>
      </section>

      <section className="mstats" aria-label="Service readiness">
        <div className="mstat mstat--ok">
          <span className="mstat__icon"><CheckCircle2 size={20} /></span>
          <b>{fleet.readyForService.size}</b>
          <span>Usable</span>
        </div>
        <div className="mstat mstat--bad">
          <span className="mstat__icon"><AlertTriangle size={20} /></span>
          <b>{fleet.notReadyForService.size}</b>
          <span>Out of service</span>
        </div>
      </section>

      {fleet.missing.length > 0 && (
        <button type="button" className="mbanner" onClick={() => onOpenBus(fleet.missing[0])}>
          <span className="mbanner__icon"><AlertTriangle size={18} /></span>
          <span className="mbanner__copy">
            <b>{fleet.missing.length} missing buses</b>
            <small>{fleet.missing.slice(0, 4).join(", ")}{fleet.missing.length > 4 ? " and more" : ""}</small>
          </span>
          <ArrowRight size={18} />
        </button>
      )}

      <div className="mapp__sec">Fleet placement</div>
      <section className="mlocations">
        {locations.map((item) => {
          const Icon = item.icon;
          return (
            <div className={`mlocation mlocation--${item.tone}`} key={item.label}>
              <span><Icon size={17} /></span>
              <b>{item.value}</b>
              <small>{item.label}</small>
            </div>
          );
        })}
      </section>

      <section className="mnotice">
        <span><Flag size={17} /></span>
        <div><strong>{flaggedCount} flagged buses</strong><small>Open maintenance items</small></div>
        <ArrowRight size={17} />
      </section>

      <div className="mapp__sec">Quick actions</div>
      <section className="mquick">
        <button type="button" className="mquickbtn mquickbtn--hot" onClick={() => onGo("lot")}>
          <span className="mquickbtn__icon"><ClipboardList size={21} /></span>
          <strong>Open Lot Sheet</strong>
          <small>Place buses and update rows</small>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="mquickbtn" onClick={() => onGo("buses")}>
          <span className="mquickbtn__icon"><Search size={21} /></span>
          <strong>Find a Bus</strong>
          <small>Location, model, and flags</small>
          <ArrowRight size={16} />
        </button>
      </section>

      <section className="mtonight__sync">
        <BusFront size={15} />
        <span>Connected to the live Pace Northwest sheets</span>
      </section>
    </div>
  );
}
