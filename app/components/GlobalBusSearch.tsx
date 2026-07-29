"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BusFront, Flag, MapPin } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { fleetBusLocations, fleetStats } from "../lib/fleetStats";
import { useFlags, useLotSheet } from "../lib/queries";
import type { FlagEntry } from "../lib/types";
import {
  Button,
  EmptyState,
  ResponsiveDialog,
  SearchField,
  StatusBadge,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import FlagPills from "./FlagPills";
import ManagerPanel from "./ManagerPanelLazy";
import TypeCodes from "./TypeCodes";
import type { FlagMap } from "../lib/types";
import styles from "./GlobalBusSearch.module.css";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export interface GlobalBusDetails {
  bus: string;
  label: string;
  model: string;
  location: string;
  status: "ready" | "notReady" | "offProperty" | "missing" | "retired";
  entry?: FlagEntry;
}

const STATUS_COPY: Record<
  GlobalBusDetails["status"],
  { label: string; tone: "success" | "warning" | "info" | "danger" | "neutral" }
> = {
  ready: { label: "Ready for service", tone: "success" },
  notReady: { label: "Not ready for service", tone: "warning" },
  offProperty: { label: "Off property", tone: "info" },
  missing: { label: "Missing", tone: "danger" },
  retired: { label: "Retired", tone: "neutral" },
};

export function GlobalBusResult({
  details,
  onOpenLotSheet,
  onEditFlags,
}: {
  details: GlobalBusDetails;
  onOpenLotSheet?: () => void;
  onEditFlags?: () => void;
}) {
  const status = STATUS_COPY[details.status];
  return (
    <div className={styles.result}>
      <div className={styles.identity}>
        <span className={styles.busIcon} aria-hidden="true">
          <BusFront />
        </span>
        <div className={styles.identityCopy}>
          <span className={styles.busNumber}>{details.label}</span>
          <span className={styles.model}>{details.model || "Fleet bus"}</span>
        </div>
        <TypeCodes num={details.bus} variant="ui" />
      </div>

      <div className={styles.summary}>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className={styles.location}>
          <MapPin aria-hidden="true" />
          {details.location}
        </span>
      </div>

      <section className={styles.flags} aria-labelledby="global-bus-flags">
        <h3 id="global-bus-flags">Active flags</h3>
        <div className={styles.flagList}>
          {details.entry &&
          ((details.entry.flags || []).length > 0 || (details.entry.note || "").trim()) ? (
            <FlagPills entry={details.entry} />
          ) : (
            <span className={styles.noFlags}>No active flags</span>
          )}
        </div>
      </section>

      {(onOpenLotSheet || onEditFlags) && (
        <div className={styles.actions}>
          {onOpenLotSheet && (
            <Button variant="primary" onPress={onOpenLotSheet}>
              Open on Lot Sheet
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
          {onEditFlags && (
            <Button variant="secondary" onPress={onEditFlags}>
              <Flag aria-hidden="true" /> Edit flags
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function GlobalBusSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { master, isKnown, label } = useBusMaster();
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const [query, setQuery] = useState("");
  const [selectedBus, setSelectedBus] = useState("");
  const [flagOpen, setFlagOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheet = sheetData?.sheet || null;

  // "/" or Ctrl/Cmd+K from anywhere focuses the fleet search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditable(event.target);
      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!slash && !combo) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);


  const details = useMemo<GlobalBusDetails | null>(() => {
    if (!selectedBus || !isKnown(selectedBus)) return null;
    const locations = fleetBusLocations(sheet, flags)[selectedBus] || [];
    const fleet = fleetStats(sheet, flags, master.buses);
    const bus = master.buses.find((item) => item.num === selectedBus);
    let status: GlobalBusDetails["status"] = "missing";
    if (bus?.status === "retired") status = "retired";
    else if (fleet.offProperty.has(selectedBus)) status = "offProperty";
    else if (fleet.readyForService.has(selectedBus)) status = "ready";
    else if (fleet.notReadyForService.has(selectedBus)) status = "notReady";
    return {
      bus: selectedBus,
      label: label(selectedBus),
      model: bus?.model || "",
      location: locations.length ? locations.join(" · ") : "No current placement",
      status,
      entry: flags[selectedBus],
    };
  }, [flags, isKnown, label, master.buses, selectedBus, sheet]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bus = sanitizeBus(query);
    if (bus) setSelectedBus(bus);
  }

  function close() {
    setSelectedBus("");
    setQuery("");
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        <SearchField
          className={styles.field}
          inputRef={inputRef}
          label="Search fleet"
          labelHidden
          placeholder="Search fleet by bus number"
          inputMode="numeric"
          value={query}
          onChange={(value) => {
            const bus = sanitizeBus(value).slice(0, 5);
            setQuery(bus);
            if (isKnown(bus)) setSelectedBus(bus);
          }}
        />
      </form>

      <ResponsiveDialog
        isOpen={!!selectedBus}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={details ? `Bus ${details.label}` : "Bus not found"}
        description={
          details
            ? "Current fleet status from the live operational sheets."
            : `${selectedBus} is not in the active bus list.`
        }
        size="sm"
        footer={(requestClose) => (
          <Button variant="quiet" onPress={requestClose}>
            Done
          </Button>
        )}
      >
        {details ? (
          <>
            <GlobalBusResult
              details={details}
              onOpenLotSheet={() => {
                close();
                if (pathname === "/") {
                  window.dispatchEvent(new CustomEvent("pace:lot-find", { detail: details.bus }));
                } else {
                  router.push(`/?find=${encodeURIComponent(details.bus)}`);
                }
              }}
              onEditFlags={() => setFlagOpen(true)}
            />
          </>
        ) : (
          <EmptyState
            icon={<BusFront />}
            title="No matching bus"
            description="Check the bus number and try again."
          />
        )}
      </ResponsiveDialog>

      {flagOpen && selectedBus && (
        <ManagerPanel
          flags={flags}
          initialBus={selectedBus}
          onBusFlagsUpdated={(bus, entry) =>
            qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [bus]: entry }))
          }
          onClose={() => setFlagOpen(false)}
        />
      )}
    </>
  );
}
