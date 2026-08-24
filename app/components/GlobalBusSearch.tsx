"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BusFront } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { fleetBusLocations, fleetStats } from "../lib/fleetStats";
import { useFlags, useLotSheet } from "../lib/queries";
import {
  Button,
  EmptyState,
  ResponsiveDialog,
  SearchField,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import ManagerPanel from "./ManagerPanelLazy";
import type { BusWorkspaceDetails, BusWorkspaceStatus } from "./ManagerPanel";
import type { FlagMap } from "../lib/types";
import styles from "./GlobalBusSearch.module.css";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export interface GlobalBusDetails extends BusWorkspaceDetails {
  model: string;
  location: string;
  status: BusWorkspaceStatus;
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

      {details && selectedBus ? (
        <ManagerPanel
          flags={flags}
          initialBus={selectedBus}
          initialDetails={details}
          onBusFlagsUpdated={(bus, entry) =>
            qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [bus]: entry }))
          }
          onOpenLotSheet={(bus) => {
            close();
            if (pathname === "/") {
              window.dispatchEvent(new CustomEvent("pace:lot-find", { detail: bus }));
            } else {
              router.push(`/?find=${encodeURIComponent(bus)}`);
            }
          }}
          onClose={close}
        />
      ) : (
        <ResponsiveDialog
          isOpen={!!selectedBus}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Bus not found"
          description={`${selectedBus} is not in the active bus list.`}
          size="sm"
          footer={(requestClose) => (
            <Button variant="quiet" onPress={requestClose}>
              Done
            </Button>
          )}
        >
          <EmptyState
            icon={<BusFront />}
            title="No matching bus"
            description="Check the bus number and try again."
          />
        </ResponsiveDialog>
      )}
    </>
  );
}
