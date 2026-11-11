import { FUEL_COLUMNS } from "../../lib/fuelBuses";

// Keep this copy in the same order and geometry as FuelSheet.buildLaneColumns.
// FuelSheet itself stays unchanged; the copies use the same live lane roster.
const BASE_ORDER = FUEL_COLUMNS.flat().map(String);

export function buildFuelCopyColumns(busNumbers: string[]) {
  const laneSet = new Set(busNumbers);
  const baseSet = new Set(BASE_ORDER);
  const list = [
    ...BASE_ORDER.filter((bus) => laneSet.has(bus)),
    ...busNumbers.filter((bus) => !baseSet.has(bus)),
  ];
  const rows = Math.max(35, Math.ceil((list.length + 1) / 4));
  const columns: (string | null)[][] = [[], [], [], []];
  list.forEach((bus, index) => { columns[Math.floor(index / rows)][index % rows] = bus; });
  for (const column of columns) while (column.length < rows) column.push(null);
  return { columns, rows, total: list.length };
}
