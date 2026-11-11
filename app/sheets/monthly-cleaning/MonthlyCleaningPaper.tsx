import type { FlagMap } from "../../lib/types";
import { FuelCopyPaper } from "../fuel-copy/FuelCopyPaper";
import { cleaningMonthLabel, type MonthlyCleaningData } from "./schema";
export { buildFuelCopyColumns as buildMonthlyCleaningColumns } from "../fuel-copy/columns";

interface MonthlyCleaningPaperProps {
  data: MonthlyCleaningData;
  busNumbers: string[];
  flags?: FlagMap;
  blank?: boolean;
  onChange?: (next: MonthlyCleaningData) => void;
}

export function MonthlyCleaningPaper({ data, busNumbers, flags, blank = false, onChange }: MonthlyCleaningPaperProps) {
  function setEntry(bus: string, key: "date" | "serv", raw: string) {
    const value = key === "date" ? raw.replace(/[^0-9/.-]/g, "").slice(0, 8) : raw.replace(/\D/g, "").slice(0, 6);
    const next = { ...(data.entries[bus] || { date: "", serv: "" }), [key]: value };
    const entries = { ...data.entries };
    if (!next.date && !next.serv) delete entries[bus];
    else entries[bus] = next;
    onChange?.({ ...data, entries });
  }
  return <FuelCopyPaper
    sheetId="monthly-cleaning" label="Monthly bus cleaning roster" busNumbers={busNumbers}
    title="MONTHLY BUS CLEANING" dateLabel="MONTH" date={cleaningMonthLabel(data.month)}
    entryLabel="DATE" blank={blank} flags={flags}
    renderEntry={(bus, field, className) => {
      const key = field === "value" ? "date" : "serv";
      const value = data.entries[bus]?.[key] || "";
      return onChange ? <input className={className} inputMode="numeric"
        aria-label={`Bus ${bus} ${key === "date" ? "cleaning date" : "servicer"}`} value={value}
        onChange={(event) => setEntry(bus, key, event.target.value)} /> : value;
    }}
  />;
}
