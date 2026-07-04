// Shared data shapes for the whole app. These describe the objects that move
// between the sheets, the API routes, and the store — define them once here and
// every file that adopts TypeScript gets checked against them.
//
// As more .js files convert to .ts, import from here instead of re-deriving the
// shapes by hand (which is how bugs like a drifting `lots` shape crept in).

// ---------- Back-of-sheet lots ----------
// North/East/Fence live on the Lot Sheet; R/C, Apron, the Lanes, and Bay are
// managed from the Turnover sheet; Cards is a screen-only shop area (never
// printed). All are shared via the lot sheet's object.
export type LotKey =
  | "north"
  | "east"
  | "fence"
  | "rc"
  | "apron"
  | "northlane"
  | "southlane"
  | "bay"
  | "cards";

// Each lot is an ordered list of bus numbers (Bay and Cards use fixed slots,
// so they may contain "" gaps).
export type Lots = { [K in LotKey]?: string[] };

// ---------- The shared Lot Sheet ----------
// One global object every device reads/writes (stored under app_state "current").
export interface LotSheet {
  time?: string;
  date?: string;
  offProperty?: string;
  inShop?: string;
  cells: Record<string, string>; // grid cell id -> bus number ("X" = blocked spot)
  lots: Lots;
  locks?: string[]; // cell ids whose bus survives "Clear Grid"
}

// ---------- Universal bus flags ----------
// A bus's flags double as its "reason" on the Turnover sheet. Flags persist
// independently of where a bus is placed and are only cleared by a user.
export interface FlagEntry {
  flags: string[]; // flag ids (e.g. "hold", "inspection", "retorque")
  note: string; // free-text "Other" note
  inspMiles: number | null; // legacy inspection mileage detail
  holdReason: string; // detail for the Hold flag
  retorqueTires: string[]; // tire ids for the Retorque flag (rf/cf/rr/cr)
  inspOption: string; // inspection type (A-3 … C-24), optional
}

export type FlagMap = Record<string, FlagEntry>; // busNumber -> entry

// ---------- Employees ----------
// Used to autofill the Turnover sheet (free text is always allowed too).
export interface Employee {
  name: string;
  badge: string;
}

// ---------- Bus master list ----------
// Model-centric fleet roster. `type` is a category id, `lane` = on Fuel/DEF.
export interface MasterBus {
  num: string;
  length?: string;
  model?: string;
  type: string; // category id: standard/short/coach/pulse/pulsehybrid/tow
  status: string; // "active" | "retired"
  lane?: boolean; // included on the Fuel/DEF lane (set after seed construction)
  name?: string; // named vehicles (e.g. JUDI)
}

export interface BusMaster {
  buses: MasterBus[];
}

// ---------- Turnover sheet's own data ----------
// Everything on the Turnover that ISN'T a shared lot (foreman, date, shift, the
// mech/lane/calloff/bay-employee fields). Stored under app_state "turnover".
export interface TurnoverData {
  cells: Record<string, string>;
  shift: string;
}
