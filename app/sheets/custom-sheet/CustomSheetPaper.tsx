import type { FlagMap } from "../../lib/types";
import { FuelCopyPaper } from "../fuel-copy/FuelCopyPaper";
import type { CustomSheetData } from "./schema";

interface CustomSheetPaperProps {
  data: CustomSheetData;
  busNumbers: string[];
  flags?: FlagMap;
  blank?: boolean;
  onChange?: (next: CustomSheetData) => void;
}

export function CustomSheetPaper({ data, busNumbers, flags, blank = false, onChange }: CustomSheetPaperProps) {
  function setEntry(bus: string, field: "gals" | "serv", raw: string) {
    let value = raw.toUpperCase().slice(0, 4);
    if (field === "gals") {
      value = raw.replace(/[^0-9.]/g, "");
      const dot = value.indexOf(".");
      if (dot !== -1) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "");
      value = value.slice(0, 6);
    }
    const next = { ...(data.entries[bus] || { gals: "", serv: "" }), [field]: value };
    const entries = { ...data.entries };
    if (!next.gals && !next.serv) delete entries[bus];
    else entries[bus] = next;
    onChange?.({ ...data, entries });
  }
  return <FuelCopyPaper
    sheetId="custom-sheet" label="Custom sheet roster" busNumbers={busNumbers}
    title={blank ? "" : data.header} titleLine date={data.date} entryLabel="GALS" blank={blank} flags={flags}
    renderEntry={(bus, field, className) => {
      const key = field === "value" ? "gals" : "serv";
      const value = data.entries[bus]?.[key] || "";
      return onChange ? <input className={className} aria-label={`Bus ${bus} ${key === "gals" ? "gallons" : "servicer"}`}
        inputMode={key === "gals" ? "decimal" : "text"} value={value}
        onChange={(event) => setEntry(bus, key, event.target.value)} /> : value;
    }}
  />;
}
