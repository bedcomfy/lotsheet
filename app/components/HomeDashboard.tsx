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
  ShieldAlert,
  Wrench,
} from "lucide-react";
import type { FlagMap, LotSheet, MasterBus } from "../lib/types";
import { fleetStats } from "../lib/fleetStats";

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

  const stats = useMemo(() => {
    const fleet = fleetStats(sheet, flags, masterBuses);
    const flagged = Object.values(flags).filter((e) => (e.flags || []).length || e.note).length;
    return {
      grid: fleet.onGrid.size,
      lots: fleet.inLots.size,
      shop: fleet.inShop.size,
      flagged,
      missing: fleet.missing.length,
    };
  }, [flags, masterBuses, sheet]);

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

      <section className="homegrid homegrid--stats" aria-label="Daily status">
        <button className="homecard statcard" onClick={() => router.push("/")}>
          <Gauge size={18} />
          <span className="statcard__value">{stats.grid}</span>
          <span className="statcard__label">On grid</span>
        </button>
        <button className="homecard statcard" onClick={() => router.push("/")}>
          <ClipboardList size={18} />
          <span className="statcard__value">{stats.lots}</span>
          <span className="statcard__label">In lots</span>
        </button>
        <button className="homecard statcard" onClick={() => router.push("/shop")}>
          <Wrench size={18} />
          <span className="statcard__value">{stats.shop}</span>
          <span className="statcard__label">In shop</span>
        </button>
        <button className="homecard statcard statcard--warn" onClick={() => router.push("/")}>
          <ShieldAlert size={18} />
          <span className="statcard__value">{stats.missing}</span>
          <span className="statcard__label">Missing</span>
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
    </main>
  );
}
