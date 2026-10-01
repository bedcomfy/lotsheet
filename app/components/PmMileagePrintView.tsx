"use client";

import { useEffect, useState } from "react";
import { busHelpers } from "../lib/buses";
import { chicagoDateShort } from "../lib/chicagoTime";
import { DEFAULT_PM_SETTINGS, emptyPmRecord, filterPmWorkItems, isPmFleetBus, pmWorkItems, type PmFilter } from "../lib/pmMileage";
import { PmMileagePaper, type PmMileagePaperProps } from "../sheets/pm-mileage/PmMileagePaper";

export default function PmMileagePrintView({ filter, query }: { filter: PmFilter; query: string }) {
  const [data, setData] = useState<PmMileagePaperProps | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.all(["/api/pm-mileage", "/api/buses"].map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })).then(([pm, fleet]) => {
      if (!alive) return;
      if (!Array.isArray(fleet.master?.buses) || !pm.records) throw new Error("Missing sheet data");
      const { buses, label } = busHelpers(fleet.master);
      const active = buses.filter(isPmFleetBus);
      const settings = pm.settings || DEFAULT_PM_SETTINGS;
      const work = pmWorkItems(active.map((bus) => pm.records[bus.num] || emptyPmRecord(bus.num)), settings);
      setData({
        items: filterPmWorkItems(work, filter, query, active, label),
        labels: Object.fromEntries(active.map((bus) => [bus.num, label(bus.num)])),
        settings, date: chicagoDateShort(), filter, query,
      });
    }).catch(() => { if (alive) setError("Couldn't load the PM sheet. Reload to try again."); });
    return () => { alive = false; };
  }, [filter, query]);

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading PM sheet…</p>;
  return <><PmMileagePaper {...data} /><div id="print-ready" hidden /></>;
}
