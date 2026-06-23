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

// Bus TYPES — permanent roster properties. A bus can have MORE THAN ONE type
// (e.g. 25545 is both Pulse and Hybrid). Shown as letter code(s) in the cell
// corner. Regular buses have no type. Pulse is purple (the buses are purple).
export const BUS_TYPES = [
  { id: "pulse", label: "Pulse", code: "P", color: "#7c3aed" },
  { id: "hybrid", label: "Hybrid", code: "HEV", color: "#15803d" },
  { id: "short", label: "Short Bus (30')", code: "30'", color: "#b45309" },
  { id: "coach", label: "Coach / Single Door", code: "COACH", color: "#0f766e" },
];

export function typeInfo(id) {
  return BUS_TYPES.find((t) => t.id === id) || null;
}

// Manager-set operational FLAGS. Each is separate; the full name is shown so
// there's no confusion.
export const FLAGS = [
  { id: "none", label: "—" },
  { id: "legal", label: "LEGAL" },
  { id: "safety", label: "SAFETY" },
  { id: "oos", label: "OUT OF SERVICE" },
  { id: "inspection", label: "INSPECTION" },
  { id: "hold", label: "HOLD" },
  { id: "movement", label: "MOVEMENT" },
  { id: "service", label: "NEEDS SERVICE" },
  { id: "cleaning", label: "NEEDS CLEANING" },
];
export function flagLabel(id) {
  const f = FLAGS.find((x) => x.id === id);
  return f ? f.label : "";
}

// The assignable flags (everything except "none").
export const ASSIGNABLE_FLAGS = FLAGS.filter((f) => f.id !== "none");

// Flag severity, most → least severe — used to pick which flag to show when a
// bus has several. A custom note ("Other") is the least severe of all.
export const FLAG_SEVERITY = [
  "legal",
  "safety",
  "oos",
  "inspection",
  "hold",
  "movement",
  "service",
  "cleaning",
];

export function mostSevereFlag(ids) {
  let best = null;
  let rank = Infinity;
  for (const f of ids || []) {
    const r = FLAG_SEVERITY.indexOf(f);
    if (r !== -1 && r < rank) {
      rank = r;
      best = f;
    }
  }
  return best || (ids && ids[0]) || null;
}

// A bus entry is { flags: [ids], note: "custom text" }.
// Shows the most-severe flag + a count of the rest, with a trailing "*" when a
// custom note exists. e.g. "INSPECTION +2", "NEEDS CLEANING +1*", "OTHER*".
export function flagDisplay(entry) {
  if (!entry) return "";
  const flags = entry.flags || [];
  const hasNote = !!(entry.note && entry.note.trim());
  const count = flags.length + (hasNote ? 1 : 0);
  if (count === 0) return "";
  const topLabel = flags.length > 0 ? flagLabel(mostSevereFlag(flags)) : "OTHER";
  const extra = count - 1;
  return `${topLabel}${extra > 0 ? ` +${extra}` : ""}${hasNote ? "*" : ""}`;
}

export function entryHasContent(entry) {
  return !!(entry && ((entry.flags && entry.flags.length) || (entry.note && entry.note.trim())));
}
