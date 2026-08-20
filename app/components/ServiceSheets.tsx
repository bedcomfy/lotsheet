"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Coins,
  Droplets,
  FileDown,
  Flag,
  Fuel,
  Gauge,
  Layers,
  Printer,
  TriangleAlert,
} from "lucide-react";
import { chicagoDateShort } from "../lib/chicagoTime";
import { openSheetPdf } from "../lib/pdf";
import { useFlags } from "../lib/queries";
import type { FlagEntry, FlagMap } from "../lib/types";
import DatePickerField from "./DatePickerField";
import FareboxSheet from "./FareboxSheet";
import FuelSheet from "./FuelSheet";
import ManagerPanel from "./ManagerPanelLazy";
import ServiceFlagSummary from "./ServiceFlagSummary";
import BusErrorsSheet from "../sheets/bus-errors/BusErrorsSheet";
import MeterReadingsSheet from "../sheets/meter-readings/MeterReadingsSheet";
import { AppPage, Button, SplitButton, TabBar, Toolbar, ToolbarGroup } from "../ui";
import styles from "./ServiceSheets.module.css";

const TABS = [
  { id: "all", label: "All", icon: Layers },
  { id: "fuel", label: "Fuel", icon: Fuel },
  { id: "def", label: "DEF", icon: Droplets },
  { id: "farebox", label: "Farebox", icon: Coins },
  { id: "meters", label: "Meter Readings", icon: Gauge },
  { id: "errors", label: "Bus Errors", icon: TriangleAlert },
  { id: "summary", label: "Flag Summary", icon: Flag },
] as const;
type TabId = (typeof TABS)[number]["id"];
type Flush = () => Promise<unknown>;

function initialTab(): TabId {
  if (typeof window === "undefined") return "all";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((item) => item.id === tab) ? (tab as TabId) : "all";
}

export default function ServiceSheets() {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [date, setDate] = useState(chicagoDateShort);
  const [managerOpen, setManagerOpen] = useState(false);
  const { data: busFlags = {} } = useFlags();
  const queryClient = useQueryClient();
  const flushers = useRef<
    Record<"fuel" | "def" | "farebox" | "meters" | "errors", Flush | null>
  >({
    fuel: null,
    def: null,
    farebox: null,
    meters: null,
    errors: null,
  });

  const registerFuel = useCallback((flush: Flush | null) => {
    flushers.current.fuel = flush;
  }, []);
  const registerDef = useCallback((flush: Flush | null) => {
    flushers.current.def = flush;
  }, []);
  const registerFarebox = useCallback((flush: Flush | null) => {
    flushers.current.farebox = flush;
  }, []);
  const registerMeters = useCallback((flush: Flush | null) => {
    flushers.current.meters = flush;
  }, []);
  const registerErrors = useCallback((flush: Flush | null) => {
    flushers.current.errors = flush;
  }, []);

  function selectTab(next: TabId) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  function flushAll() {
    return Promise.all(
      Object.values(flushers.current)
        .filter((flush): flush is Flush => !!flush)
        .map((flush) => flush())
    );
  }

  function printBlankAll() {
    openSheetPdf({ path: "/service/print-blank", params: { blank: 1 } });
  }

  function printAll() {
    openSheetPdf({
      path: "/service/print-all",
      maint: true,
      params: { dateOverride: date },
      flush: flushAll,
    });
  }

  function printSummary() {
    openSheetPdf({
      path: "/service/summary",
      maint: true,
      params: { dateOverride: date },
    });
  }

  const onFlagsUpdated = useCallback(
    (bus: string, entry: FlagEntry) => {
      queryClient.setQueryData<FlagMap>(["flags"], (current = {}) => ({
        ...current,
        [bus]: entry,
      }));
    },
    [queryClient],
  );

  return (
    <AppPage className={styles.page}>
      <TabBar
        label="Service sheets"
        selectedKey={tab}
        onSelectionChange={(key) => selectTab(key as TabId)}
        className="no-print"
        items={TABS.map((item) => {
          const Icon = item.icon;
          return {
            id: item.id,
            label: item.label,
            icon: <Icon aria-hidden="true" />,
          };
        })}
      />

      {(tab === "all" || tab === "summary") && (
        <Toolbar className="no-print">
          <label className={styles.dateField}>
            <span>Date</span>
            <DatePickerField
              value={date}
              onValueChange={setDate}
              shortYear
              ariaLabel="Service sheets date"
              variant="ui"
            />
          </label>

          <ToolbarGroup>
            {tab === "all" ? (
              <>
                <Button onPress={() => setManagerOpen(true)}>
                  <Flag aria-hidden="true" /> Edit Flags
                </Button>
                <SplitButton
                  variant="primary"
                  onPress={printAll}
                  menuLabel="Print options"
                  items={[{ id: "blank", label: "Print blank forms", icon: <FileDown size={16} /> }]}
                  onAction={(key) => {
                    if (key === "blank") printBlankAll();
                  }}
                >
                  <Printer size={16} /> Print PDF
                </SplitButton>
              </>
            ) : (
              <Button variant="primary" onPress={printSummary}>
                <Printer size={16} /> Print PDF
              </Button>
            )}
          </ToolbarGroup>
        </Toolbar>
      )}

      {tab === "all" && (
        <div className={styles.preview} aria-label="Combined print preview">
          <FuelSheet
            title="PNW FUEL SHEET"
            storageKey="fuel"
            embedded
            marker={false}
            showFlags
            dateOverride={date}
            onRegisterFlush={registerFuel}
          />
          <FuelSheet
            title="PNW DEF SHEET"
            storageKey="def"
            showShiftFields
            embedded
            marker={false}
            showFlags
            previewLaneCopies
            dateOverride={date}
            onRegisterFlush={registerDef}
          />
          <FareboxSheet
            embedded
            marker={false}
            previewLaneCopies
            dateOverride={date}
            onRegisterFlush={registerFarebox}
          />
          <MeterReadingsSheet
            embedded
            marker={false}
            dateOverride={date}
            onRegisterFlush={registerMeters}
          />
          <BusErrorsSheet
            embedded
            marker={false}
            onRegisterFlush={registerErrors}
          />
          <ServiceFlagSummary dateOverride={date} marker={false} />
        </div>
      )}

      {tab === "fuel" && <FuelSheet title="PNW FUEL SHEET" storageKey="fuel" />}
      {tab === "def" && <FuelSheet title="PNW DEF SHEET" storageKey="def" showShiftFields laneCopies />}
      {tab === "farebox" && <FareboxSheet />}
      {tab === "meters" && <MeterReadingsSheet />}
      {tab === "errors" && <BusErrorsSheet />}
      {tab === "summary" && <ServiceFlagSummary dateOverride={date} />}

      {managerOpen && (
        <ManagerPanel
          flags={busFlags}
          onClose={() => setManagerOpen(false)}
          onBusFlagsUpdated={onFlagsUpdated}
        />
      )}
    </AppPage>
  );
}
