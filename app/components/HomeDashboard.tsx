"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  ListChecks,
  RefreshCw,
  Search,
  CheckCircle2,
  CircleAlert,
  MapPinOff,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import type { FlagMap, LotSheet, MasterBus } from "../lib/types";
import { fleetBusLocations, fleetStats } from "../lib/fleetStats";
import Overlay, { closeOverlayFromEvent } from "./Overlay";

interface BusMasterResponse {
  master?: { buses?: MasterBus[] };
}

interface SheetResponse {
  sheet?: LotSheet | null;
  updatedAt?: string | null;
}

interface FlagsResponse {
  flags?: FlagMap;
}

type StatusDetail = "usable" | "outOfService" | "grid" | "lots" | "shop" | "missing" | "offProperty";

function formatSaved(iso: string | null | undefined): string {
  if (!iso) return "Not saved yet";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HomeDashboard() {
  const router = useRouter();
  const [sheet, setSheet] = useState<LotSheet | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [flags, setFlags] = useState<FlagMap>({});
  const [masterBuses, setMasterBuses] = useState<MasterBus[]>([]);
  const [findBus, setFindBus] = useState("");
  const [statusDetail, setStatusDetail] = useState<StatusDetail | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => Promise.all([
      fetch("/api/sheet", { cache: "no-store" })
        .then((r) => r.json() as Promise<SheetResponse>)
        .catch((): SheetResponse => ({})),
      fetch("/api/flags", { cache: "no-store" })
        .then((r) => r.json() as Promise<FlagsResponse>)
        .catch((): FlagsResponse => ({})),
      fetch("/api/buses", { cache: "no-store" })
        .then((r) => r.json() as Promise<BusMasterResponse>)
        .catch((): BusMasterResponse => ({})),
    ]).then(([sheetData, flagData, busData]) => {
      if (!alive) return;
      setSheet(sheetData.sheet || null);
      setUpdatedAt(sheetData.updatedAt || null);
      setFlags(flagData.flags || {});
      setMasterBuses(busData.master?.buses || []);
    });
    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const fleet = useMemo(() => fleetStats(sheet, flags, masterBuses), [flags, masterBuses, sheet]);
  const locations = useMemo(() => fleetBusLocations(sheet, flags), [flags, sheet]);
  const stats = useMemo(() => {
    const flagged = Object.values(flags).filter((e) => (e.flags || []).length || e.note).length;
    return {
      grid: fleet.onGrid.size,
      lots: fleet.inLots.size,
      shop: fleet.inShop.size,
      offProperty: fleet.offProperty.size,
      ready: fleet.readyForService.size,
      notReady: fleet.notReadyForService.size,
      flagged,
      missing: fleet.missing.length,
    };
  }, [flags, fleet]);

  const detail = useMemo(() => {
    if (!statusDetail) return null;
    const sort = (buses: string[]) => buses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const configs: Record<StatusDetail, { title: string; description: string; buses: string[] }> = {
      usable: {
        title: "Usable buses",
        description: "Active buses currently placed on the service grid.",
        buses: sort([...fleet.readyForService]),
      },
      outOfService: {
        title: "Out of Service buses",
        description: "Active buses in a lot, shop area, or off property.",
        buses: sort([...fleet.notReadyForService]),
      },
      grid: {
        title: "Buses on grid",
        description: "Every bus currently placed on the Lot Sheet grid.",
        buses: sort([...fleet.onGrid]),
      },
      lots: {
        title: "Buses in lots",
        description: "Buses in North Lot, East Lot, or Fence.",
        buses: sort([...fleet.inLots]),
      },
      shop: {
        title: "Buses in shop",
        description: "Buses physically placed in Apron, Bays, or Cards.",
        buses: sort([...fleet.inShop]),
      },
      missing: {
        title: "Missing buses",
        description: "Active buses with no current grid, lot, shop, or off-property location.",
        buses: [...fleet.missing],
      },
      offProperty: {
        title: "Buses off property",
        description: "Active buses currently marked Off property.",
        buses: sort([...fleet.offProperty]),
      },
    };
    return configs[statusDetail];
  }, [fleet, statusDetail]);

  const quickActions = [
    { label: "Open Lot Sheet", meta: "Daily grid and printout", path: "/", icon: ClipboardList },
    { label: "Fill Rows", meta: "Fast row entry workflow", path: "/?fill=1", icon: ListChecks },
    { label: "Turnover Sheet", meta: "Shift handoff and lot reasons", path: "/turnover", icon: RefreshCw },
    { label: "Work Order", meta: "Oracle eAM printable form", path: "/workorder", icon: FileText },
  ];

  const sheetLinks = [
    { label: "Fuel Sheet", path: "/fuel", icon: Fuel },
    { label: "DEF Sheet", path: "/def", icon: Droplets },
    { label: "Shop", path: "/shop", icon: Wrench },
    { label: "Admin Tools", path: "/admin/flags", icon: ShieldAlert },
  ];

  return (
    <main className="home">
      <section className="homehero">
        <div>
          <div className="homehero__eyebrow">Pace Northwest</div>
          <h1>Operations Workspace</h1>
          <p>Start the daily sheets, check bus status, and jump into the tools the garage uses most.</p>
        </div>
        <div className="homefind">
          <Search size={17} />
          <input
            value={findBus}
            inputMode="numeric"
            placeholder="Find bus"
            onChange={(e) => setFindBus(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && findBus) router.push(`/?find=${encodeURIComponent(findBus)}`);
            }}
          />
          <button onClick={() => router.push(findBus ? `/?find=${encodeURIComponent(findBus)}` : "/")}>
            Open
          </button>
        </div>
      </section>

      <section className="homegrid homegrid--service" aria-label="Service readiness">
        <button className="homecard statcard statcard--ready" onClick={() => setStatusDetail("usable")} aria-haspopup="dialog">
          <CheckCircle2 size={18} />
          <span className="statcard__value">{stats.ready}</span>
          <span className="statcard__label">Usable</span>
        </button>
        <button className="homecard statcard statcard--notready" onClick={() => setStatusDetail("outOfService")} aria-haspopup="dialog">
          <CircleAlert size={18} />
          <span className="statcard__value">{stats.notReady}</span>
          <span className="statcard__label">Out of Service</span>
        </button>
      </section>

      <section className="homegrid homegrid--stats" aria-label="Daily locations">
        <button className="homecard statcard" onClick={() => setStatusDetail("grid")} aria-haspopup="dialog">
          <Gauge size={18} />
          <span className="statcard__value">{stats.grid}</span>
          <span className="statcard__label">On grid</span>
        </button>
        <button className="homecard statcard" onClick={() => setStatusDetail("lots")} aria-haspopup="dialog">
          <ClipboardList size={18} />
          <span className="statcard__value">{stats.lots}</span>
          <span className="statcard__label">In lots</span>
        </button>
        <button className="homecard statcard" onClick={() => setStatusDetail("shop")} aria-haspopup="dialog">
          <Wrench size={18} />
          <span className="statcard__value">{stats.shop}</span>
          <span className="statcard__label">In shop</span>
        </button>
        <button className="homecard statcard statcard--warn" onClick={() => setStatusDetail("missing")} aria-haspopup="dialog">
          <ShieldAlert size={18} />
          <span className="statcard__value">{stats.missing}</span>
          <span className="statcard__label">Missing</span>
        </button>
        <button className="homecard statcard" onClick={() => setStatusDetail("offProperty")} aria-haspopup="dialog">
          <MapPinOff size={18} />
          <span className="statcard__value">{stats.offProperty}</span>
          <span className="statcard__label">Off property</span>
        </button>
      </section>

      <section className="homecols">
        <div>
          <div className="home__sectionhead">
            <h2>Start Here</h2>
            <span>Last saved {formatSaved(updatedAt)}</span>
          </div>
          <div className="actionlist">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button className="actionrow" key={action.label} onClick={() => router.push(action.path)}>
                  <span className="actionrow__icon"><Icon size={19} /></span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.meta}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="home__sectionhead">
            <h2>Sheets & Tools</h2>
            <span>{stats.flagged} flagged buses</span>
          </div>
          <div className="tooltiles">
            {sheetLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  className="tooltile"
                  key={link.label}
                  onClick={() => router.push(link.path)}
                >
                  <Icon size={20} />
                  <span>{link.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {detail && (
        <Overlay
          onClose={() => setStatusDetail(null)}
          overlayClassName="modal-backdrop home-status-backdrop no-print"
          contentClassName="modal modal--tall home-status-modal"
          label={detail.title}
        >
          <div className="modal__head">
            <div>
              <div className="modal__title">{detail.title}</div>
              <div className="modal__sub">{detail.description}</div>
            </div>
            <button className="modal__close" onClick={closeOverlayFromEvent} aria-label="Close"><X size={20} /></button>
          </div>
          <div className="home-status-summary">
            <strong>{detail.buses.length}</strong> bus{detail.buses.length === 1 ? "" : "es"}
          </div>
          <div className="home-status-list">
            {detail.buses.length === 0 && <div className="lotlist__empty">No buses in this group.</div>}
            {detail.buses.map((bus) => (
              <div className="home-status-row" key={bus}>
                <strong>{bus}</strong>
                <span>{statusDetail === "missing" ? "No current location" : (locations[bus] || ["No current location"]).join(" / ")}</span>
              </div>
            ))}
          </div>
        </Overlay>
      )}
    </main>
  );
}
