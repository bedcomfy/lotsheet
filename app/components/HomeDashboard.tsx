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
  CheckCircle2,
  CircleAlert,
  MapPinOff,
  ShieldAlert,
  Users,
  Wrench,
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
import { SkeletonStat } from "./Skeleton";
import { Button } from "../ui/Button";
import { SearchField } from "../ui/Field";
import { MetricTile } from "../ui/MetricTile";
import { Pressable } from "../ui/Pressable";
import { ResponsiveDialog } from "../ui/ResponsiveDialog";
import { StatusBadge } from "../ui/StatusBadge";
import styles from "./HomeDashboard.module.css";

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
  const activeFleetCount = fleet.activeFleet.size;
  const stats = useMemo(() => {
    const flagged = Object.entries(flags).filter(([bus, entry]) =>
      fleet.activeFleet.has(bus) && ((entry.flags || []).length || entry.note)
    ).length;
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
        description: "Active buses currently in a lot or shop area.",
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
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.eyebrow}>
            <span aria-hidden="true" />
            Live operations
          </div>
          <div className={styles.titleRow}>
            <div>
              <h1>Maintenance Logistics</h1>
              <p>
                Fleet readiness, garage placement, staffing, and daily sheets
                in one operational view.
              </p>
            </div>
            <div className={styles.saveState}>
              <StatusBadge tone="accent">Live updates</StatusBadge>
              <span>Last saved {formatSaved(updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className={styles.workspace}>
          <div className={styles.actions}>
            <Button variant="primary" onPress={() => router.push("/")}>
              <ClipboardList aria-hidden="true" />
              Open Lot Sheet
            </Button>
            <Button onPress={() => router.push("/workorder")}>
              <FileText aria-hidden="true" />
              Work Order
            </Button>
            <Button onPress={() => router.push("/service")}>
              <Fuel aria-hidden="true" />
              Service Sheets
            </Button>
          </div>
          <div className={styles.search}>
            <SearchField
              label="Find a bus"
              value={findBus}
              inputMode="numeric"
              placeholder="Enter bus number"
              onChange={(value) =>
                setFindBus(value.replace(/\D/g, "").slice(0, 5))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && findBus) {
                  router.push(`/?find=${encodeURIComponent(findBus)}`);
                }
              }}
            />
            <Button
              onPress={() =>
                router.push(
                  findBus ? `/?find=${encodeURIComponent(findBus)}` : "/",
                )
              }
            >
              Find
            </Button>
          </div>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Fleet overview">
        <MetricTile
          label="Usable buses"
          value={stat(stats.ready)}
          detail="Ready for service"
          icon={<CheckCircle2 />}
          tone="success"
          onPress={() => setStatusDetail("usable")}
          aria-haspopup="dialog"
        />
        <MetricTile
          label="Out of service"
          value={stat(stats.notReady)}
          detail="Lots and shop"
          icon={<CircleAlert />}
          tone="warning"
          onPress={() => setStatusDetail("outOfService")}
          aria-haspopup="dialog"
        />
        <MetricTile
          label="Off property"
          value={stat(stats.offProperty)}
          detail="Tracked separately"
          icon={<MapPinOff />}
          tone="info"
          onPress={() => setStatusDetail("offProperty")}
          aria-haspopup="dialog"
        />
        <MetricTile
          label="In shop"
          value={stat(stats.shop)}
          detail="Apron, bays, and cards"
          icon={<Wrench />}
          tone="accent"
          onPress={() => setStatusDetail("shop")}
          aria-haspopup="dialog"
        />
        <MetricTile
          label="Missing"
          value={stat(stats.missing)}
          detail="No current placement"
          icon={<ShieldAlert />}
          tone="danger"
          onPress={() => setStatusDetail("missing")}
          aria-haspopup="dialog"
        />
      </section>

      <section className={styles.overview}>
        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <div>
              <h2>Fleet Distribution</h2>
              <p>{activeFleetCount} active buses across the garage</p>
            </div>
            <Pressable onPress={() => router.push("/buses")}>View fleet <ArrowRight size={14} /></Pressable>
          </header>
          <div className={styles.distribution}>
            {[
              { label: "On grid", value: stats.grid, detail: "Ready", tone: "blue", status: "grid" as StatusDetail },
              { label: "In lots", value: stats.lots, detail: "North, East, Fence", tone: "amber", status: "lots" as StatusDetail },
              { label: "In shop", value: stats.shop, detail: "Apron, Bays, Cards", tone: "info", status: "shop" as StatusDetail },
              { label: "Off property", value: stats.offProperty, detail: "Away from garage", tone: "slate", status: "offProperty" as StatusDetail },
            ].map((item) => (
              <Pressable className={styles.distributionRow} key={item.label} onPress={() => setStatusDetail(item.status)}>
                <span className={`${styles.distributionDot} ${styles[`tone${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`} />
                <span className={styles.distributionLabel}><strong>{item.label}</strong><small>{item.detail}</small></span>
                <span className={styles.distributionTrack}>
                  <i
                    className={`${styles.distributionFill} ${styles[`tone${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}
                    style={{ width: `${Math.max(3, Math.round((item.value / Math.max(activeFleetCount, 1)) * 100))}%` }}
                  />
                </span>
                <strong className={styles.distributionValue}>{item.value}</strong>
              </Pressable>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <div>
              <h2>Available Now</h2>
              <p>{availability.label}</p>
            </div>
            <Pressable onPress={() => router.push("/staffing/workpick")}>Work pick <ArrowRight size={14} /></Pressable>
          </header>
          <div className={styles.compactList}>
            {BUCKETS.map((bucket) => {
              const people = availability.byBucket[bucket.id];
              const Icon = bucket.id === "mech" ? Wrench : Users;
              return (
                <Pressable className={styles.staffRow} key={bucket.id} onPress={() => setAvailBucket(bucket.id)}>
                  <span className={`${styles.listIcon} ${bucket.id === "mech" ? styles.listIconSuccess : styles.listIconAccent}`}><Icon size={18} /></span>
                  <span><strong>{bucket.label}</strong><small>On the clock now</small></span>
                  <b>{people.length}</b>
                  <ArrowRight size={15} />
                </Pressable>
              );
            })}
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <div>
              <h2>Needs Attention</h2>
              <p>Live exceptions from the sheets</p>
            </div>
          </header>
          <div className={styles.compactList}>
            <Pressable className={styles.attentionRow} onPress={() => setStatusDetail("missing")}>
              <span className={`${styles.listIcon} ${styles.listIconDanger}`}><ShieldAlert size={18} /></span>
              <span><strong>{stats.missing} buses missing</strong><small>No location on any sheet</small></span>
              <ArrowRight size={15} />
            </Pressable>
            <Pressable className={styles.attentionRow} onPress={() => router.push("/?flags=1")}>
              <span className={`${styles.listIcon} ${styles.listIconWarning}`}><CircleAlert size={18} /></span>
              <span><strong>{stats.flagged} flagged buses</strong><small>Open maintenance items</small></span>
              <ArrowRight size={15} />
            </Pressable>
            <Pressable className={styles.attentionRow} onPress={() => setStatusDetail("offProperty")}>
              <span className={`${styles.listIcon} ${styles.listIconAccent}`}><MapPinOff size={18} /></span>
              <span><strong>{stats.offProperty} off property</strong><small>Tracked outside the garage</small></span>
              <ArrowRight size={15} />
            </Pressable>
          </div>
        </article>
      </section>

      <section className={styles.operations}>
        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <div>
              <h2>Daily Operations</h2>
              <p>Last saved {formatSaved(updatedAt)}</p>
            </div>
          </header>
          <div className={styles.actionList}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Pressable className={styles.actionRow} key={action.label} onPress={() => router.push(action.path)}>
                  <span className={styles.actionIcon}><Icon size={19} /></span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.meta}</small>
                  </span>
                  <ArrowRight size={17} />
                </Pressable>
              );
            })}
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <div>
              <h2>Sheets &amp; Tools</h2>
              <p>Garage forms and references</p>
            </div>
          </header>
          <div className={styles.toolTiles}>
            {sheetLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Pressable className={styles.toolTile} key={link.label} onPress={() => router.push(link.path)}>
                  <span><Icon size={20} /></span>
                  <strong>{link.label}</strong>
                  <ArrowRight size={16} />
                </Pressable>
              );
            })}
          </div>
        </article>
      </section>

      <section className={styles.footnote}>
        <BusFront size={16} />
        <span>Live from Pace Northwest operational sheets</span>
        <i />
        <span>Updates automatically</span>
      </section>

      {availBucket && (() => {
        const label = BUCKETS.find((b) => b.id === availBucket)?.label || "";
        const people = availability.byBucket[availBucket];
        return (
          <ResponsiveDialog
            isOpen
            onOpenChange={(open) => {
              if (!open) setAvailBucket(null);
            }}
            title={label}
            description={`On the clock right now — ${availability.label}.`}
            size="md"
            footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
          >
            <div className={styles.statusSummary}>
              <strong>{people.length}</strong> available now
            </div>
            <div className={styles.statusList}>
              {people.length === 0 && <div className={styles.empty}>No one scheduled right now.</div>}
              {people.map((person, i) => (
                <div className={styles.availabilityRow} key={`${person.employeeId || person.name}-${i}`}>
                  <strong>{person.name || "—"}</strong>
                  <span className={styles.availabilityRole}>{person.role}</span>
                  <span className={styles.availabilityShift}>{person.shift} · {person.hours}</span>
                </div>
              ))}
            </div>
          </ResponsiveDialog>
        );
      })()}

      {detail && (
        <ResponsiveDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setStatusDetail(null);
          }}
          title={detail.title}
          description={detail.description}
          size="md"
          footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
        >
          <div className={styles.statusSummary}>
            <strong>{detail.buses.length}</strong> bus{detail.buses.length === 1 ? "" : "es"}
          </div>
          <div className={styles.statusList}>
            {detail.buses.length === 0 && <div className={styles.empty}>No buses in this group.</div>}
            {detail.buses.map((bus) => {
              const why = flags[bus] ? flagsFullDisplay(flags[bus]) : "";
              return (
                <div className={styles.statusRow} key={bus}>
                  <strong>{bus}</strong>
                  <span className={styles.statusWhere}>
                    {statusDetail === "missing" ? "No current location" : (locations[bus] || ["No current location"]).join(" / ")}
                  </span>
                  {why && <span className={styles.statusWhy}>{why}</span>}
                </div>
              );
            })}
          </div>
        </ResponsiveDialog>
      )}
    </main>
  );
}
