// The bus master list. The data below is the DEFAULT / seed (from the fleet
// spreadsheet); once edited in-app it's overridden by the saved DB copy via the
// BusMaster context. Each bus: { num, length, model, type, status, lane, name? }.
//   type  = category id (drives the corner code on the lot sheet)
//   status= "active" | "retired"
//   lane  = included on the Fuel / DEF (service lane) sheets

import { FUEL_COLUMNS } from "./fuelBuses";
import { BUS_TYPES, modelIdFromName, modelInfo } from "./grid";
import type { MasterBus, BusMaster } from "./types";

export interface BusCategory {
  id: string;
  label: string;
  codes: string[];
}

// Selectable bus types (categories) and the lot-sheet code(s) each maps to.
// A bus's type is editable — the model just suggests it.
export const BUS_CATEGORIES: BusCategory[] = [
  { id: "standard", label: "Standard", codes: [] },
  { id: "short", label: "Short Bus", codes: ["short"] },
  { id: "coach", label: "Coach / Single Door", codes: ["coach"] },
  { id: "pulse", label: "Pulse", codes: ["pulse"] },
  { id: "pulsehybrid", label: "Pulse & Hybrid", codes: ["pulse", "hybrid"] },
  { id: "tow", label: "Tow Truck", codes: ["tow"] },
];
const CATEGORY_CODES: Record<string, string[]> = {};
for (const c of BUS_CATEGORIES) CATEGORY_CODES[c.id] = c.codes;

// Legacy single-category id -> atomic type ids, for migrating old saved buses
// (which stored one `type` category) to the new multi-type `types` list.
export const LEGACY_CATEGORY_TYPES: Record<string, string[]> = {
  standard: ["standard"],
  short: ["short"],
  coach: ["coach"],
  pulse: ["pulse"],
  pulsehybrid: ["pulse", "hybrid"],
  tow: ["tow"],
};

function legacyTypeIds(b: MasterBus | null | undefined): string[] {
  if (!b) return [];
  if (Array.isArray(b.types)) return b.types.map((t) => String(t)).filter(Boolean);
  if (typeof b.type === "string" && b.type) return LEGACY_CATEGORY_TYPES[b.type] || [b.type];
  return [];
}

export function busModelId(b: MasterBus | null | undefined): string {
  if (!b) return "";
  return String(b.modelId || "").trim() || modelIdFromName(b.model);
}

export function busWrapId(b: MasterBus | null | undefined): string {
  if (!b) return "standard";
  const explicit = String(b.wrapId || "").trim();
  if (explicit) return explicit;
  return legacyTypeIds(b).includes("pulse") ? "pulse" : "standard";
}

// The atomic type ids for a bus, tolerating both the new `types` array and the
// legacy single `type` category. This is the one place that reconciles the two.
export function busTypeIds(b: MasterBus | null | undefined): string[] {
  if (!b) return [];
  const profile = modelInfo(busModelId(b));
  if (profile) return Array.from(new Set([busWrapId(b), profile.typeId].filter(Boolean)));
  return legacyTypeIds(b);
}

export const BUS_LENGTHS = ["30 feet", "40 feet"];
export const BUS_STATUSES = [
  { id: "active", label: "Active" },
  { id: "retired", label: "Retired" },
];

// ---- seed data (the current fleet) ----
interface SeedAttrs {
  model: string;
  type: string;
  length: string;
  status?: string;
}
function mk(nums: number[], attrs: SeedAttrs): MasterBus[] {
  return nums.map((n) => ({ num: String(n), status: "active", ...attrs }));
}
const SEED: MasterBus[] = [
  // 2010 ENC EZ-Rider II — Short Bus, 30 feet
  ...mk([2770, 2771, 2772, 2774, 2775, 2776, 2779, 2801], { model: "2010 ENC EZ-Rider II", type: "short", length: "30 feet" }),
  ...mk([2769, 2777, 2781, 2782, 2783, 2784, 2797], { model: "2010 ENC EZ-Rider II", type: "short", length: "30 feet", status: "retired" }),
  // 2013 ENC Commuter — Coach / Single Door
  ...mk([6378, 6381, 6388], { model: "2013 ENC Commuter", type: "coach", length: "40 feet" }),
  // 2013 ENC Axess — Standard
  ...mk([6392, 6393, 6394, 6396, 6397, 6398, 6399, 6400], { model: "2013 ENC Axess", type: "standard", length: "40 feet" }),
  // 2014 ENC Axess — Standard
  ...mk(
    [6395, 6401, 6402, 6403, 6404, 6405, 6406, 6407, 6408, 6409, 6410, 6411, 6412, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421, 6422, 6423, 6424, 6425, 6426, 6427, 6428, 6429, 6430],
    { model: "2014 ENC Axess", type: "standard", length: "40 feet" }
  ),
  // 2015 ENC Axess — Standard
  ...mk(
    [6431, 6432, 6433, 6434, 6435, 6436, 6437, 6438, 6439, 6440, 6441, 6442, 6443, 6444, 6445, 6446, 6447, 6448, 6449, 6450, 6451, 6452, 6453, 6454, 6455, 6456, 6457, 6458, 6459, 6460, 6461, 6462, 6464, 6465, 6466, 6467, 6468, 6469, 6470, 6471, 6472, 6473, 6474, 6475, 6476],
    { model: "2015 ENC Axess", type: "standard", length: "40 feet" }
  ),
  ...mk([6463], { model: "2015 ENC Axess", type: "standard", length: "40 feet", status: "retired" }),
  // 2016 ENC Commuter — Coach / Single Door
  ...mk([6485, 6492, 6494, 6497, 6504], { model: "2016 ENC Commuter", type: "coach", length: "40 feet" }),
  // 2016 ENC Pulse SS — Pulse
  ...mk([6510, 6511, 6512, 6514, 6515, 6516, 6517, 6518, 6519, 6520, 6521], { model: "2016 ENC Pulse SS", type: "pulse", length: "40 feet" }),
  // 2016 ENC Axess SS — Standard
  ...mk([6560, 6561, 6562], { model: "2016 ENC Axess SS", type: "standard", length: "40 feet" }),
  // 2016 ENC Pulse/Axess SS — Pulse
  ...mk([6563, 6564, 6565, 6566, 6567, 6568, 6569, 6570, 6571, 6572, 6573], { model: "2016 ENC Pulse/Axess SS", type: "pulse", length: "40 feet" }),
  // Gillig Low Floor Diesel Electric Hybrid — Pulse & Hybrid
  ...mk([25538, 25539, 25545], { model: "Gillig Low Floor Diesel Electric Hybrid", type: "pulsehybrid", length: "40 feet" }),
  // Named vehicle (tow truck), not in the fleet spreadsheet
  { num: "9690", model: "Tow Truck", type: "tow", length: "", status: "active", name: "JUDI" },
];

// Seed lane membership from the current Fuel sheet list (active buses only).
const FUEL_SET = new Set(FUEL_COLUMNS.flat().map(String));
for (const b of SEED) b.lane = b.status === "active" && FUEL_SET.has(b.num);

export const DEFAULT_MASTER: BusMaster = { buses: SEED };

// The distinct model names currently in use (for the editor's Model dropdown).
export const KNOWN_MODELS = [...new Set(SEED.map((b) => b.model).filter(Boolean))];

// Build the lookup helpers for a given master list.
export function busHelpers(master?: BusMaster | null) {
  const buses = master && Array.isArray(master.buses) ? master.buses : DEFAULT_MASTER.buses;
  const numbers = buses.map((b) => b.num);
  const set = new Set(numbers);
  const byNum: Record<string, MasterBus> = {};
  const names: Record<string, string> = {};
  for (const b of buses) {
    byNum[b.num] = b;
    if (b.name) names[b.num] = b.name;
  }
  return {
    buses,
    numbers,
    set,
    isKnown: (num: string) => set.has(num),
    types: (num: string) => busTypeIds(byNum[num]),
    label: (num: string) => names[num] || num,
    bus: (num: string) => byNum[num] || null,
    names,
    // Buses on the Fuel/DEF service lane (active + lane flag).
    laneBuses: () => buses.filter((b) => b.lane && b.status !== "retired").map((b) => b.num),
  };
}

const DEFAULT = busHelpers(DEFAULT_MASTER);

// ---- backward-compatible static exports (the DEFAULT seed) ----
export const BUS_NUMBERS = DEFAULT.numbers;
export const BUS_SET = DEFAULT.set;
export const VEHICLE_LABELS = DEFAULT.names;
export function isKnownBus(num: string): boolean {
  return DEFAULT.isKnown(num);
}
export function busLabel(num: string): string {
  return DEFAULT.label(num);
}
export function busTypes(num: string): string[] {
  return DEFAULT.types(num);
}

// What may be typed into a bus box. Digits only (keeps the mobile number pad).
// Standard buses start with 2 or 6; named vehicles (Judi = 9690) match by prefix.
const SPECIAL_VEHICLE_NUMBERS = Object.keys(DEFAULT.names);
export function sanitizeBus(raw: unknown): string {
  const d = String(raw).replace(/\D/g, "").slice(0, 5);
  if (!d) return "";
  if (d[0] === "2" || d[0] === "6") return d;
  if (SPECIAL_VEHICLE_NUMBERS.some((n) => n.startsWith(d))) return d;
  return "";
}

// ---- CSV import/export (for the bulk "Edit CSV" editor) ----
function csvCell(v: unknown): string {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Master list -> CSV text (the columns from the fleet spreadsheet + Fuel/DEF).
// A bus can have several types, joined with " + " (e.g. "Pulse + Hybrid").
function typeLabel(id: string): string {
  return BUS_TYPES.find((t) => t.id === id)?.label || id;
}
export function masterToCsv(buses: MasterBus[]): string {
  const head = ["Bus Number", "Bus Length", "Bus Model", "Model Tag", "Wrap", "Status", "Fuel/DEF"];
  const rows = (buses || []).map((b) => {
    const profile = modelInfo(busModelId(b));
    const modelTag = profile?.typeId ? typeLabel(profile.typeId) : "";
    return [b.num, profile?.length || b.length || "", profile?.label || b.model || "", modelTag, typeLabel(busWrapId(b)),
      b.status === "retired" ? "Retired" : "Active", b.lane ? "Yes" : "No"]
      .map(csvCell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

// CSV text -> master list. Columns are matched by header name, so order/extra
// columns don't matter. Unknown bus types fall back to Standard.
export function csvToMaster(text: string): BusMaster {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { buses: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iNum = col("number") >= 0 ? col("number") : 0;
  const iLen = col("length");
  const iModel = col("model");
  const iType = header.findIndex((h) => h.includes("model tag") || h === "bus type" || h === "type");
  const iWrap = col("wrap");
  const iStatus = col("status");
  const iLane = col("fuel", "lane", "def");
  // Legacy category labels/ids (old CSVs stored one "Bus Type" like "Pulse & Hybrid").
  const labelToCat: Record<string, string> = {};
  BUS_CATEGORIES.forEach((c) => (labelToCat[c.label.toLowerCase()] = c.id));
  const matchTypeId = (part: string): string => {
    const p = part.trim().toLowerCase();
    return BUS_TYPES.find((t) => t.id.toLowerCase() === p || t.label.toLowerCase() === p)?.id || "";
  };
  const parseTypes = (raw: string): string[] => {
    const cell = (raw || "").trim();
    if (!cell) return ["standard"];
    const lc = cell.toLowerCase();
    if (labelToCat[lc]) return LEGACY_CATEGORY_TYPES[labelToCat[lc]] || ["standard"];
    if (BUS_CATEGORIES.some((c) => c.id === lc)) return LEGACY_CATEGORY_TYPES[lc] || ["standard"];
    const ids = cell.split("+").map(matchTypeId).filter(Boolean);
    return ids.length ? Array.from(new Set(ids)) : ["standard"];
  };
  const parseWrap = (raw: string, legacyTypes: string[]): string => {
    const clean = String(raw || "").trim().toLowerCase();
    const match = BUS_TYPES.find((type) => type.kind === "wrap" && (type.id.toLowerCase() === clean || type.label.toLowerCase() === clean));
    return match?.id || (legacyTypes.includes("pulse") ? "pulse" : "standard");
  };
  const seen = new Set<string>();
  const buses: MasterBus[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const num = sanitizeBus(cells[iNum] || "");
    if (num.length < 4 || seen.has(num)) continue;
    seen.add(num);
    const model = iModel >= 0 ? (cells[iModel] || "").trim() : "";
    const legacyTypes = parseTypes(iType >= 0 ? cells[iType] || "" : "");
    const wrapId = parseWrap(iWrap >= 0 ? cells[iWrap] || "" : "", legacyTypes);
    buses.push({
      num,
      length: iLen >= 0 ? (cells[iLen] || "").trim() : "",
      model,
      modelId: modelIdFromName(model),
      wrapId,
      types: Array.from(new Set([...legacyTypes, wrapId])),
      status: /retire/i.test((iStatus >= 0 ? cells[iStatus] : "") || "") ? "retired" : "active",
      lane: iLane >= 0 ? /^(y|t|1)/i.test((cells[iLane] || "").trim()) : false,
    });
  }
  return { buses };
}
