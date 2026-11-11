import { FuelCopyPaper } from "../fuel-copy/FuelCopyPaper";
import type { CustomSheetData } from "./schema";

interface CustomSheetPaperProps {
  data: CustomSheetData;
  busNumbers: string[];
  blank?: boolean;
}

export function CustomSheetPaper({ data, busNumbers, blank = false }: CustomSheetPaperProps) {
  return <FuelCopyPaper
    sheetId="custom-sheet" label="Custom sheet roster" busNumbers={busNumbers}
    title={blank ? "" : data.header} titleLine centeredHeader date={data.date}
    entryLabel="OK" secondEntryLabel="N / R" blank={blank}
    renderEntry={() => null}
  />;
}
