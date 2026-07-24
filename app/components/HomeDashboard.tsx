"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BusFront,
  ClipboardList,
  Coins,
  FileText,
  Fuel,
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
import { SkeletonStat } from "./Skeleton";

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
  const { data: sheetData, isLoading: sheetLoading } = useLotSheet();
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
  const stat = (value: number) => (sheetLoading ? <SkeletonStat /> : value);

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
  const activeFleetCount = useMemo(
    () => masterBuses.filter((bus) => bus.status !== "retired").length,
    [masterBuses]
  );
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
        <div className="homehero__content">
          <div className="homehero__eyebrow"><span /> Pace Northwest Garage</div>
          <h1>Maintenance Logistics</h1>
          <p>Live fleet placement, service readiness, staffing, and the daily sheets in one operational view.</p>
          <div className="homehero__actions">
            <button type="button" onClick={() => router.push("/")}>
              <ClipboardList size={17} /> Open Lot Sheet
            </button>
            <button type="button" onClick={() => router.push("/workorder")}>
              <FileText size={17} /> Create Work Order
            </button>
            <button type="button" onClick={() => router.push("/service")}>
              <Fuel size={17} /> Service Sheets
            </button>
          </div>
        </div>
        <div className="homehero__search">
          <span>Find a vehicle</span>
          <div className="homefind">
            <Search size={17} />
            <input
              value={findBus}
              inputMode="numeric"
              placeholder="Enter bus number"
              onChange={(e) => setFindBus(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && findBus) router.push(`/?find=${encodeURIComponent(findBus)}`);
              }}
            />
            <button onClick={() => router.push(findBus ? `/?find=${encodeURIComponent(findBus)}` : "/")}>
              Search
            </button>
          </div>
        </div>
      </section>

      <section className="homeoverview" aria-label="Fleet overview">
        <button className="homecard metriccard metriccard--ready" onClick={() => setStatusDetail("usable")} aria-haspopup="dialog">
          <span className="metriccard__icon"><CheckCircle2 size={22} /></span>
          <span className="metriccard__copy"><small>Usable fleet</small><strong>{stat(stats.ready)}</strong><em>Ready for service</em></span>
          <ArrowRight size={18} />
        </button>
        <button className="homecard metriccard metriccard--out" onClick={() => setStatusDetail("outOfService")} aria-haspopup="dialog">
          <span className="metriccard__icon"><CircleAlert size={22} /></span>
          <span className="metriccard__copy"><small>Out of service</small><strong>{stat(stats.notReady)}</strong><em>Lots, shop, or off property</em></span>
          <ArrowRight size={18} />
        </button>
        <button className="homecard metriccard metriccard--shop" onClick={() => setStatusDetail("shop")} aria-haspopup="dialog">
          <span className="metriccard__icon"><Wrench size={22} /></span>
          <span className="metriccard__copy"><small>In shop</small><strong>{stat(stats.shop)}</strong><em>Apron, bays, and cards</em></span>
          <ArrowRight size={18} />
        </button>
        <button className="homecard metriccard metriccard--missing" onClick={() => setStatusDetail("missing")} aria-haspopup="dialog">
          <span className="metriccard__icon"><ShieldAlert size={22} /></span>
          <span className="metriccard__copy"><small>Missing</small><strong>{stat(stats.missing)}</strong><em>No current placement</em></span>
          <ArrowRight size={18} />
        </button>
      </section>

      <section className="homedashboard">
        <article className="homepanel homepanel--fleet">
          <header className="homepanel__head">
            <div>
              <h2>Fleet Distribution</h2>
              <p>{activeFleetCount} active buses across the garage</p>
            </div>
            <button type="button" onClick={() => router.push("/buses")}>View fleet <ArrowRight size={14} /></button>
          </header>
          <div className="distribution">
            {[
              { label: "On grid", value: stats.grid, detail: "Ready", tone: "blue", status: "grid" as StatusDetail },
              { label: "In lots", value: stats.lots, detail: "North, East, Fence", tone: "amber", status: "lots" as StatusDetail },
              { label: "In shop", value: stats.shop, detail: "Apron, Bays, Cards", tone: "purple", status: "shop" as StatusDetail },
              { label: "Off property", value: stats.offProperty, detail: "Away from garage", tone: "slate", status: "offProperty" as StatusDetail },
            ].map((item) => (
              <button type="button" className="distribution__row" key={item.label} onClick={() => setStatusDetail(item.status)}>
                <span className={`distribution__dot distribution__dot--${item.tone}`} />
                <span className="distribution__label"><strong>{item.label}</strong><small>{item.detail}</small></span>
                <span className="distribution__track"><i className={`distribution__fill distribution__fill--${item.tone}`} style={{ width: `${Math.max(3, Math.round((item.value / Math.max(activeFleetCount, 1)) * 100))}%` }} /></span>
                <strong className="distribution__value">{item.value}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="homepanel homepanel--staff">
          <header className="homepanel__head">
            <div>
              <h2>Available Now</h2>
              <p>{availability.label}</p>
            </div>
            <button type="button" onClick={() => router.push("/staffing/workpick")}>Work pick <ArrowRight size={14} /></button>
          </header>
          <div className="stafflist">
            {BUCKETS.map((bucket) => {
              const people = availability.byBucket[bucket.id];
              const Icon = bucket.id === "mech" ? Wrench : Users;
              return (
                <button type="button" key={bucket.id} onClick={() => setAvailBucket(bucket.id)}>
                  <span className={`stafflist__icon stafflist__icon--${bucket.id}`}><Icon size={18} /></span>
                  <span><strong>{bucket.label}</strong><small>On the clock now</small></span>
                  <b>{people.length}</b>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </div>
        </article>

        <article className="homepanel homepanel--attention">
          <header className="homepanel__head">
            <div>
              <h2>Needs Attention</h2>
              <p>Live exceptions from the sheets</p>
            </div>
          </header>
          <div className="attentionlist">
            <button type="button" onClick={() => setStatusDetail("missing")}>
              <span className="attentionlist__icon attentionlist__icon--danger"><ShieldAlert size={18} /></span>
              <span><strong>{stats.missing} buses missing</strong><small>No location on any sheet</small></span>
              <ArrowRight size={15} />
            </button>
            <button type="button" onClick={() => router.push("/?flags=1")}>
              <span className="attentionlist__icon attentionlist__icon--warn"><CircleAlert size={18} /></span>
              <span><strong>{stats.flagged} flagged buses</strong><small>Open maintenance items</small></span>
              <ArrowRight size={15} />
            </button>
            <button type="button" onClick={() => setStatusDetail("offProperty")}>
              <span className="attentionlist__icon"><MapPinOff size={18} /></span>
              <span><strong>{stats.offProperty} off property</strong><small>Tracked outside the garage</small></span>
              <ArrowRight size={15} />
            </button>
          </div>
        </article>
      </section>

      <section className="homeworkspace">
        <article className="homepanel">
          <header className="homepanel__head">
            <div>
              <h2>Daily Operations</h2>
              <p>Last saved {formatSaved(updatedAt)}</p>
            </div>
          </header>
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
                  <ArrowRight size={17} />
                </button>
              );
            })}
          </div>
        </article>

        <article className="homepanel">
          <header className="homepanel__head">
            <div>
              <h2>Sheets &amp; Tools</h2>
              <p>Garage forms and references</p>
            </div>
          </header>
          <div className="tooltiles">
            {sheetLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button className="tooltile" key={link.label} onClick={() => router.push(link.path)}>
                  <span><Icon size={20} /></span>
                  <strong>{link.label}</strong>
                  <ArrowRight size={16} />
                </button>
              );
            })}
          </div>
        </article>
      </section>

      <section className="homefootnote">
        <BusFront size={16} />
        <span>Live from Pace Northwest operational sheets</span>
        <i />
        <span>Updates automatically</span>
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
