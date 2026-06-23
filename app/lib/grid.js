// Exact layout of the physical Lot Sheet.
//
// The main grid is 11 columns (ROW 1 .. ROW 11) by 10 bands (top -> bottom).
// Each entry is the printed slot number, or:
//   null  -> no printed number (ROW 11 column, filled only in special cases)
//   "X"   -> physically blocked slot (cannot hold a bus)
//
// Reading ACROSS each band matches the paper: 1..10, 11..20, ... and the
// blocked "X" sits where slot 40 would have been in ROW 10.
export const SLOTS = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null],
  [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, null],
  [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, null],
  [31, 32, 33, 34, 35, 36, 37, 38, 39, "X", null],
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, null],
  [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, null],
  [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, null],
  [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, null],
  [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, null],
  [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, null],
];

export const COLUMN_COUNT = 11; // ROW 1 .. ROW 11
export const BAND_COUNT = SLOTS.length; // 10

// ROW 1 .. ROW 6 each get one extra "front" bus written above the first cell.
export const FRONT_COLUMNS = 6;

// East Lot strip across the bottom: present on the form (required) but unused.
export const EAST_LOT_CELLS = 11;

// Stable id for a writable cell, used as the key in the saved data object.
export function numberedCellId(slot) {
  return `s${slot}`;
}
export function frontCellId(col) {
  return `f${col}`; // col is 0-based: ROW 1 -> f0 ... ROW 6 -> f5
}
export function row11CellId(band) {
  return `r11_${band}`; // band 0..9
}

// Screen-only colour swatches (never printed). Placeholder palette — easy to
// adjust once we know the real colour meanings.
export const COLORS = [
  { id: "none", label: "None", hex: "transparent" },
  { id: "white", label: "White", hex: "#e8e8e8" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "black", label: "Black", hex: "#111827" },
];

// Screen-only status options (never printed). Placeholder set.
export const STATUSES = [
  { id: "none", label: "—" },
  { id: "ready", label: "Ready" },
  { id: "fuel", label: "Needs fuel" },
  { id: "clean", label: "Needs cleaning" },
  { id: "shop", label: "In shop" },
  { id: "oos", label: "Out of service" },
];
