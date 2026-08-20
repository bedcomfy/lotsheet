"use client";

import { useCallback, useEffect, useState } from "react";
import FareboxSheet from "./FareboxSheet";
import FuelSheet from "./FuelSheet";
import ServiceFlagSummary from "./ServiceFlagSummary";
import BusErrorsSheet from "../sheets/bus-errors/BusErrorsSheet";
import MeterReadingsSheet from "../sheets/meter-readings/MeterReadingsSheet";

function param(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

// Composite print target. Its order is also the All-tab preview order:
// Fuel, DEF North/South, Farebox North/South, meter readings, bus errors,
// then the optional flag summary.
export default function PrintAllServiceSheets() {
  const [options, setOptions] = useState({ loaded: false, includeFlags: false, dateOverride: "" });
  const [ready, setReady] = useState({
    fuel: false,
    def: false,
    farebox: false,
    meters: false,
    errors: false,
    summary: false,
  });

  useEffect(() => {
    setOptions({ loaded: true, includeFlags: param("maint") === "1", dateOverride: param("dateOverride") });
  }, []);

  const fuelReady = useCallback((value: boolean) => setReady((current) => ({ ...current, fuel: value })), []);
  const defReady = useCallback((value: boolean) => setReady((current) => ({ ...current, def: value })), []);
  const fareboxReady = useCallback((value: boolean) => setReady((current) => ({ ...current, farebox: value })), []);
  const metersReady = useCallback((value: boolean) => setReady((current) => ({ ...current, meters: value })), []);
  const errorsReady = useCallback((value: boolean) => setReady((current) => ({ ...current, errors: value })), []);
  const summaryReady = useCallback((value: boolean) => setReady((current) => ({ ...current, summary: value })), []);

  if (!options.loaded) return null;

  const allReady =
    ready.fuel
    && ready.def
    && ready.farebox
    && ready.meters
    && ready.errors
    && (!options.includeFlags || ready.summary);

  return (
    <main className="service-print-all">
      <FuelSheet
        title="PNW FUEL SHEET"
        storageKey="fuel"
        embedded
        marker={false}
        showFlags={options.includeFlags}
        dateOverride={options.dateOverride}
        onReady={fuelReady}
      />
      <FuelSheet
        title="PNW DEF SHEET"
        storageKey="def"
        showShiftFields
        embedded
        marker={false}
        showFlags={options.includeFlags}
        previewLaneCopies
        dateOverride={options.dateOverride}
        onReady={defReady}
      />
      <FareboxSheet
        embedded
        marker={false}
        previewLaneCopies
        dateOverride={options.dateOverride}
        onReady={fareboxReady}
      />
      <MeterReadingsSheet
        embedded
        marker={false}
        dateOverride={options.dateOverride}
        onReady={metersReady}
      />
      <BusErrorsSheet embedded marker={false} onReady={errorsReady} />
      {options.includeFlags && (
        <ServiceFlagSummary
          dateOverride={options.dateOverride}
          onReady={summaryReady}
          marker={false}
        />
      )}
      {allReady && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </main>
  );
}
