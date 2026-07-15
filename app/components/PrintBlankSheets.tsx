"use client";

import FuelSheet from "./FuelSheet";
import FareboxSheet from "./FareboxSheet";
import { useBusMaster } from "./BusMasterProvider";

// The "Print Blank (all sheets)" target: a blank fuel sheet, a blank DEF sheet
// (no lane indicator), and one blank farebox set, stacked into one printout.
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
      {ready && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </>
  );
}
