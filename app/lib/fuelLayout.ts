// Shared structural layout for the Fuel / DEF sheet, used by BOTH the on-screen
// React component (FuelSheet) and the react-pdf print template (FuelPdf). Keeping
// the column build + headers here means a change to the sheet's structure is one
// edit that both the screen and the printout pick up.

import { FUEL_COLUMNS } from "./fuelBuses";

// The sheet's familiar order: the original column order first, then any newly
// added lane buses appended.
export const BASE_ORDER = FUEL_COLUMNS.flat().map(String);

export interface LaneColumns {
  columns: (string | null)[][];
  rows: number;
  total: number;
}

// Build the 4-column grid from the live lane membership, padded to the paper's
// 35-row layout (or taller if the lane outgrows it). The "+1" reserves the cell
// the "Total: N" label sits in.
export function buildLaneColumns(laneList: string[]): LaneColumns {
  const laneSet = new Set(laneList);
  const baseSet = new Set(BASE_ORDER);
  const ordered = BASE_ORDER.filter((n) => laneSet.has(n));
  const extras = laneList.filter((n) => !baseSet.has(n));
  const list = [...ordered, ...extras];
  const total = list.length;
  const rows = Math.max(35, Math.ceil((total + 1) / 4));
  const columns: (string | null)[][] = [[], [], [], []];
  for (let i = 0; i < total; i++) columns[Math.floor(i / rows)][i % rows] = list[i];
  for (const c of columns) while (c.length < rows) c.push(null);
  return { columns, rows, total };
}

export const COL_HEADERS = ["BUS", "GALS", "SERV", "BUS", "GALS", "SERV", "BUS", "GALS", "SERV", "BUS", "GALS", "SERV"];

// The date the sheet is printed, as MM/DD/YY (e.g. 06/25/26).
export function printDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${String(d.getFullYear()).slice(-2)}`;
}
