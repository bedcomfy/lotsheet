"use client";

import FuelSheet from "./FuelSheet";
import FareboxSheet from "./FareboxSheet";
import { useBusMaster } from "./BusMasterProvider";
import BusErrorsSheet from "../sheets/bus-errors/BusErrorsSheet";
import MeterReadingsSheet from "../sheets/meter-readings/MeterReadingsSheet";

// The "Print Blank (all sheets)" target: blank fuel, DEF, farebox, meter
// readings, and bus-error forms stacked into one printout.
// Always loaded with ?print=1&blank=1 — the sheets see blank=1 themselves and
// render empty with no flags. One shared #print-ready marker fires when the
// bus list is in (blank sheets have no other data to wait for).
export default function PrintBlankSheets() {
  const { ready } = useBusMaster();
  return (
    <>
      <FuelSheet title="PNW FUEL SHEET" storageKey="fuel" marker={false} />
      <FuelSheet title="PNW DEF SHEET" storageKey="def" showShiftFields marker={false} />
      <FareboxSheet marker={false} />
      <MeterReadingsSheet embedded marker={false} />
      <BusErrorsSheet embedded marker={false} />
      {ready && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </>
  );
}
