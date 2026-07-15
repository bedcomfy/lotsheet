"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ClipboardList,
  Clock,
  Coins,
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
  Users,
  Wrench,
  X,
} from "lucide-react";
import { fleetBusLocations, fleetStats } from "../lib/fleetStats";
import { flagsFullDisplay } from "../lib/grid";
import { chicagoNowMinutes, chicagoParts, chicagoWeekday } from "../lib/chicagoTime";
import {
  availabilityByBucket,
  availableNow,
  BUCKETS,
  DAYS,
  type Bucket,
} from "../lib/staffing";
import { WORK_PICK_SEED } from "../lib/workPickSeed";
import { useBusMasterList, useEmployees, useFlags, useLotSheet, useWorkPick } from "../lib/queries";
import Overlay, { closeOverlayFromEvent } from "./Overlay";

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
  // Shared, cached, deduplicated server state (TanStack Query).
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { data: masterBuses = [] } = useBusMasterList();
  const { data: pick = null } = useWorkPick();
  const { data: employees = [] } = useEmployees();
  const [now, setNow] = useState<number>(0);
  const [findBus, setFindBus] = useState("");
  const [statusDetail, setStatusDetail] = useState<StatusDetail | null>(null);
  const [availBucket, setAvailBucket] = useState<Bucket | null>(null);

  const sheet = sheetData?.sheet || null;
  const updatedAt = sheetData?.updatedAt || null;

  // "Available Now" depends on wall-clock time (it changes at minute boundaries),
  // independent of the data refetch — so tick it on its own timer.
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 20000);
    return () => window.clearInterval(t);
  }, []);

  const unavailable = useMemo(() => {
    const out = new Set<string>();
    for (const e of employees) if ((e.availability || "").trim() && e.badge) out.add(e.badge);
    return out;
  }, [employees]);

  const availability = useMemo(() => {
    const effectivePick = pick && Array.isArray(pick.shifts) ? pick : WORK_PICK_SEED;
    if (!now) return { byBucket: availabilityByBucket([]), label: "", usingSeed: !pick };
    const d = new Date(now);
    const today = chicagoWeekday(d);
    const nowMin = chicagoNowMinutes(d);
    const p = chicagoParts(d);
    const h24 = Number(p.hour24);
    const h12 = h24 % 12 || 12;
    const ampm = h24 >= 12 ? "PM" : "AM";
    return {
      byBucket: availabilityByBucket(availableNow(effectivePick, today, nowMin, unavailable)),
      label: `${DAYS[today].long} ${h12}:${p.minute} ${ampm}`,
      usingSeed: !pick,
    };
  }, [pick, now, unavailable]);

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
    { label: "Service Sheets", path: "/service", icon: Fuel },
    { label: "Farebox Checks", path: "/service?tab=farebox", icon: Coins },
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

      <section className="homeavail" aria-label="Available employees">
        <div className="homeavail__head">
          <h2><Clock size={17} /> Available Now</h2>
          <span className="homeavail__when">{availability.label}</span>
          <button className="homeavail__link" onClick={() => router.push("/staffing/workpick")}>
            <CalendarClock size={15} /> Work Pick
          </button>
        </div>
        <div className="homeavail__cards">
          {BUCKETS.map((b) => {
            const people = availability.byBucket[b.id];
            const Icon = b.id === "mech" ? Wrench : Users;
            return (
              <button
                key={b.id}
                className={`homecard availcard availcard--${b.id}`}
                onClick={() => setAvailBucket(b.id)}
                aria-haspopup="dialog"
              >
                <Icon size={18} />
                <span className="availcard__value">{people.length}</span>
                <span className="availcard__label">{b.label}</span>
              </button>
            );
          })}
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

      {availBucket && (() => {
        const label = BUCKETS.find((b) => b.id === availBucket)?.label || "";
        const people = availability.byBucket[availBucket];
        return (
          <Overlay
            onClose={() => setAvailBucket(null)}
            overlayClassName="modal-backdrop home-status-backdrop no-print"
            contentClassName="modal modal--tall home-status-modal"
            label={label}
          >
            <div className="modal__head">
              <div>
                <div className="modal__title">{label}</div>
                <div className="modal__sub">On the clock right now — {availability.label}.</div>
              </div>
              <button className="modal__close" onClick={closeOverlayFromEvent} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="home-status-summary">
              <strong>{people.length}</strong> available now
            </div>
            <div className="home-status-list">
              {people.length === 0 && <div className="lotlist__empty">No one scheduled right now.</div>}
              {people.map((person, i) => (
                <div className="availrow" key={`${person.employeeId || person.name}-${i}`}>
                  <strong>{person.name || "—"}</strong>
                  <span className="availrow__role">{person.role}</span>
                  <span className="availrow__shift">{person.shift} · {person.hours}</span>
                </div>
              ))}
            </div>
          </Overlay>
        );
      })()}

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
            {detail.buses.map((bus) => {
              const why = flags[bus] ? flagsFullDisplay(flags[bus]) : "";
              return (
                <div className="home-status-row" key={bus}>
                  <strong>{bus}</strong>
                  <span className="home-status-where">
                    {statusDetail === "missing" ? "No current location" : (locations[bus] || ["No current location"]).join(" / ")}
                  </span>
                  {why && <span className="home-status-why">{why}</span>}
                </div>
              );
            })}
          </div>
        </Overlay>
      )}
    </main>
  );
}
