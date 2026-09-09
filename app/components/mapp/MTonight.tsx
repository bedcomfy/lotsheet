"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Flag,
  Fuel,
  ListChecks,
  MapPinOff,
  MapPinned,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useBusMasterList, useFlags, useLotSheet } from "../../lib/queries";
import { fleetBusLocations, fleetStats } from "../../lib/fleetStats";
import { hasServiceLaneFlags } from "../../lib/serviceLaneSetup";
import { Button } from "../../ui/Button";
import { MetricTile } from "../../ui/MetricTile";
import { Pressable } from "../../ui/Pressable";
import { StatusBadge } from "../../ui/StatusBadge";
import FleetGroupDialog from "../FleetGroupDialog";
import styles from "./MTonight.module.css";

type DetailId =
  | "ready"
  | "notReady"
  | "offProperty"
  | "missing"
  | "grid"
  | "lots"
  | "shop"
  | "flagged";

interface MTonightProps {
  onGo: (tab: string) => void;
  onOpenBus: (bus: string) => void;
}

export default function MTonight({ onGo, onOpenBus }: MTonightProps) {
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { data: masterBuses = [] } = useBusMasterList();
  const [detailId, setDetailId] = useState<DetailId | null>(null);
  const sheet = sheetData?.sheet || null;

  const fleet = useMemo(
    () => fleetStats(sheet, flags, masterBuses),
    [sheet, flags, masterBuses],
  );
  const locations = useMemo(
    () => fleetBusLocations(sheet, flags),
    [sheet, flags],
  );
  const flagged = useMemo(
    () =>
      Object.entries(flags)
        .filter(
          ([bus, entry]) =>
            fleet.activeFleet.has(bus) &&
            ((entry.flags || []).length > 0 || entry.note),
        )
        .map(([bus]) => bus)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [flags, fleet.activeFleet],
  );
  const lane = useMemo(() => {
    const active = Object.entries(flags).filter(([bus]) => fleet.activeFleet.has(bus));
    const withFlag = (id: string) => active.filter(([, entry]) => (entry.flags || []).includes(id)).length;
    return {
      buses: active.filter(([, entry]) => hasServiceLaneFlags(entry)).length,
      inspections: withFlag("inspection"),
      retorques: withFlag("retorque"),
      cards: withFlag("hold") + withFlag("cards"),
    };
  }, [flags, fleet.activeFleet]);

  const detail = useMemo(() => {
    if (!detailId) return null;
    const sorted = (buses: Iterable<string>) =>
      [...buses].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    const details: Record<
      DetailId,
      { title: string; description: string; buses: string[] }
    > = {
      ready: {
        title: "Usable buses",
        description: "Active buses currently placed on the service grid.",
        buses: sorted(fleet.readyForService),
      },
      notReady: {
        title: "Out of service",
        description: "Active buses currently in a lot or shop area.",
        buses: sorted(fleet.notReadyForService),
      },
      offProperty: {
        title: "Off property",
        description: "Tracked separately from service readiness.",
        buses: sorted(fleet.offProperty),
      },
      missing: {
        title: "Missing buses",
        description: "Active buses without a current recorded location.",
        buses: fleet.missing,
      },
      grid: {
        title: "Ready for Use",
        description: "Buses placed on the Lot Sheet service grid.",
        buses: sorted(fleet.onGrid),
      },
      lots: {
        title: "In the lots",
        description: "Buses in North Lot, East Lot, or Fence.",
        buses: sorted(fleet.inLots),
      },
      shop: {
        title: "In the shop",
        description: "Buses in Apron, Bays, or Cards.",
        buses: sorted(fleet.inShop),
      },
      flagged: {
        title: "Flagged buses",
        description: "Active buses with an open maintenance flag or note.",
        buses: flagged,
      },
    };
    return details[detailId];
  }, [detailId, flagged, fleet]);

  const placement = [
    {
      id: "grid" as const,
      label: "Ready for Use",
      detail: "On the Lot Sheet grid",
      value: fleet.onGrid.size,
      icon: ClipboardList,
      tone: "accent" as const,
    },
    {
      id: "lots" as const,
      label: "In lots",
      detail: "North, East, Fence",
      value: fleet.inLots.size,
      icon: MapPinned,
      tone: "warning" as const,
    },
    {
      id: "shop" as const,
      label: "In shop",
      detail: "Apron, Bays, Cards",
      value: fleet.inShop.size,
      icon: Wrench,
      tone: "info" as const,
    },
    {
      id: "offProperty" as const,
      label: "Off property",
      detail: "Away from garage",
      value: fleet.offProperty.size,
      icon: Warehouse,
      tone: "neutral" as const,
    },
  ];

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero}>
        <StatusBadge className={styles.liveBadge} tone="success" size="sm">
          Live operations
        </StatusBadge>
        <div className={styles.heroCopy}>
          <h1>Maintenance Logistics</h1>
          <p>Tonight&apos;s fleet readiness and garage placement.</p>
        </div>
      </section>

      <section className={styles.primaryAction} aria-label="Continue working">
        <div>
          <span>Working sheet</span>
          <strong>Continue Lot Sheet</strong>
          <small>Place buses, update rows, and manage flags</small>
        </div>
        <Button variant="primary" onPress={() => onGo("lot")}>
          Open
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>

      <section className={styles.primaryAction} aria-label="Tonight's lane">
        <div>
          <span>Tonight&apos;s lane</span>
          <strong>
            {lane.inspections} insp · {lane.retorques} retorque · {lane.cards} to cards
          </strong>
          <small>{lane.buses} bus{lane.buses === 1 ? "" : "es"} on the printable service lane</small>
        </div>
        <Button onPress={() => onGo("setup")}>
          <ListChecks aria-hidden="true" />
          Set up
        </Button>
      </section>

      <div className={styles.sectionHeading}>
        <div>
          <span>Service readiness</span>
          <small>Updated from the live Lot Sheet</small>
        </div>
      </div>
      <section className={styles.readiness} aria-label="Service readiness">
        <MetricTile
          className={styles.readinessTile}
          label="Usable"
          value={fleet.readyForService.size}
          detail="Ready for service"
          icon={<CheckCircle2 />}
          tone="success"
          onPress={() => setDetailId("ready")}
          aria-haspopup="dialog"
        />
        <MetricTile
          className={styles.readinessTile}
          label="Out of service"
          value={fleet.notReadyForService.size}
          detail="In lots or shop"
          icon={<CircleAlert />}
          tone="warning"
          onPress={() => setDetailId("notReady")}
          aria-haspopup="dialog"
        />
        <MetricTile
          className={`${styles.readinessTile} ${styles.offPropertyTile}`}
          label="Off property"
          value={fleet.offProperty.size}
          detail="Tracked outside readiness"
          icon={<MapPinOff />}
          tone="info"
          onPress={() => setDetailId("offProperty")}
          aria-haspopup="dialog"
        />
      </section>

      {fleet.missing.length > 0 && (
        <Pressable
          className={styles.alert}
          onPress={() => setDetailId("missing")}
        >
          <span className={styles.alertIcon}>
            <CircleAlert aria-hidden="true" />
          </span>
          <span>
            <strong>{fleet.missing.length} missing buses</strong>
            <small>
              {fleet.missing.slice(0, 4).join(", ")}
              {fleet.missing.length > 4 ? " and more" : ""}
            </small>
          </span>
          <ArrowRight aria-hidden="true" />
        </Pressable>
      )}

      <div className={styles.sectionHeading}>
        <div>
          <span>Fleet placement</span>
          <small>Tap a group to see its buses</small>
        </div>
      </div>
      <section className={styles.placement} aria-label="Fleet placement">
        {placement.map((item) => {
          const Icon = item.icon;
          return (
            <MetricTile
              className={styles.placementTile}
              key={item.id}
              label={item.label}
              value={item.value}
              detail={item.detail}
              icon={<Icon />}
              tone={item.tone}
              onPress={() => setDetailId(item.id)}
              aria-haspopup="dialog"
            />
          );
        })}
      </section>

      <Pressable
        className={styles.flagged}
        onPress={() => setDetailId("flagged")}
      >
        <span className={styles.flaggedIcon}>
          <Flag aria-hidden="true" />
        </span>
        <span>
          <strong>{flagged.length} flagged buses</strong>
          <small>Review open maintenance items</small>
        </span>
        <ArrowRight aria-hidden="true" />
      </Pressable>

      <div className={styles.sectionHeading}>
        <div>
          <span>Quick actions</span>
          <small>Common work, one tap away</small>
        </div>
      </div>
      <section className={styles.quickActions} aria-label="Quick actions">
        <Button fullWidth onPress={() => onGo("service")}>
          <Fuel aria-hidden="true" />
          Service Sheets
        </Button>
        <Button fullWidth onPress={() => onGo("turnover")}>
          <ClipboardList aria-hidden="true" />
          Turnover
        </Button>
      </section>

      <footer className={styles.sync}>
        <span aria-hidden="true" />
        Connected to the live Pace Northwest sheets
      </footer>

      <FleetGroupDialog
        isOpen={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        title={detail?.title || ""}
        description={detail?.description}
        buses={detail?.buses || []}
        flags={flags}
        locations={locations}
        noLocation={detailId === "missing"}
        onOpenBus={onOpenBus}
      />
    </div>
  );
}
