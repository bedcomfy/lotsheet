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

// Each lot is an ordered list of bus numbers (Bay uses fixed slots, so it may
// contain "" gaps; Cards is a plain list — no fixed spots).
export type Lots = { [K in LotKey]?: string[] };

// ---------- The shared Lot Sheet ----------
// One global object every device reads/writes (stored under app_state "current").
export interface LotSheet {
  time?: string;
  date?: string;
  timeOverride?: boolean;
  dateOverride?: boolean;
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
  flags: string[]; // operational ids plus encoded, independently removable custom notes
  note: string; // legacy single-note field; kept readable while old records remain
  inspMiles: number | null; // legacy inspection mileage detail
  holdReason: string; // detail for the Hold flag
  retorqueTires: string[]; // tire ids for the Retorque flag (rf/cf/rr/cr)
  inspOption: string; // inspection type (A-3 through C-24 or TRANS-75), optional
}

export type FlagMap = Record<string, FlagEntry>; // busNumber -> entry

// ---------- Employees ----------
// Used to autofill the Turnover sheet (free text is always allowed too) and, going
// forward, a staffing sheet — hence first/last split + start date + classification.
export interface Employee {
  firstName: string;
  lastName: string;
  badge: string;
  startDate: string; // Shop seniority, ISO "YYYY-MM-DD", or "" if unset
  hireDate: string; // Pace hire date, ISO "YYYY-MM-DD", or "" if unset
  classification: string; // job title / role
  // "" = available/on the schedule; otherwise the reason they're unavailable
  // (Vacation, Time Off, Out of Service…). Unavailable employees never count as
  // "Available Now" and are struck through on the Work Pick.
  availability?: string;
  name?: string; // legacy combined name (old data); derive from first+last otherwise
}

// Full display name for an employee, tolerating legacy {name}-only records.
export function employeeFullName(e: Employee | null | undefined): string {
  if (!e) return "";
  const combined = `${e.firstName || ""} ${e.lastName || ""}`.trim();
  return combined || e.name || "";
}

// ---------- Bus master list ----------
// Model-centric fleet roster. `type` is a category id, `lane` = on Fuel/DEF.
export interface MasterBus {
  num: string;
  length?: string;
  model?: string;
  modelId?: string; // stable link to the admin-managed bus model
  wrapId?: string; // independent wrap id (standard/pulse)
  // A bus can have MORE THAN ONE type (e.g. Pulse + Hybrid). `types` is the list
  // of atomic type ids (pulse/hybrid/short/coach/tow/standard/custom…). `type` is
  // the legacy single-category field kept for reading old saved data — new writes
  // populate `types`; helpers migrate `type` -> `types` on read.
  types?: string[];
  type?: string; // legacy category id: standard/short/coach/pulse/pulsehybrid/tow
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
