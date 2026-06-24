// Official list of valid bus numbers (from the garage roster).
// All start with 2 or 6 and are 4-5 digits. Update this list as the fleet changes.
export const BUS_NUMBERS = [
  "2769", "2770", "2771", "2772", "2774", "2775", "2776", "2777", "2779",
  "2781", "2782", "2783", "2784", "2797", "2801",
  "6392", "6393", "6394", "6395", "6396", "6397", "6398", "6399", "6400",
  "6401", "6402", "6403", "6404", "6405", "6406", "6407", "6408", "6409",
  "6410", "6411", "6412", "6414", "6415", "6416", "6417", "6418", "6419",
  "6420", "6421", "6422", "6423", "6424", "6425", "6426", "6427", "6428",
  "6429", "6430", "6431", "6432", "6433", "6434", "6435", "6436", "6437",
  "6438", "6439", "6440", "6441", "6442", "6443", "6444", "6445", "6446",
  "6447", "6448", "6449", "6450", "6451", "6452", "6453", "6454", "6455",
  "6456", "6457", "6458", "6459", "6460", "6461", "6462", "6463", "6464",
  "6465", "6466", "6468", "6469", "6470", "6471", "6472", "6473", "6474",
  "6475", "6476", "6510", "6511", "6512", "6514", "6515", "6516", "6517",
  "6518", "6519", "6520", "6521", "6560", "6561", "6562", "6563", "6564",
  "6565", "6566", "6567", "6568", "6569", "6570", "6571", "6572", "6573",
  "6378", "6381", "6388", "6485", "6492", "6494", "6497", "6504", "6467",
  "25545", "25538", "25539",
  // Named (non-numbered) vehicles, e.g. the tow truck.
  "JUDI",
];

export const BUS_SET = new Set(BUS_NUMBERS);

// Named vehicles that aren't 2-/6-prefixed numbers (typed as letters).
export const NAMED_VEHICLES = ["JUDI"];

export function isKnownBus(num) {
  return BUS_SET.has(num);
}

// Single source of truth for what may be typed into a bus box. Allows a numeric
// bus (must start with 2 or 6, max 5 digits) OR a named vehicle like JUDI. Any
// in-progress prefix of a named vehicle is allowed so it can be typed letter by
// letter; anything that can't become a valid value is rejected.
export function sanitizeBus(raw) {
  const s = String(raw).toUpperCase();
  const letters = s.replace(/[^A-Z]/g, "");
  if (letters) {
    const match = NAMED_VEHICLES.find((v) => v.startsWith(letters));
    return match ? letters.slice(0, match.length) : "";
  }
  let d = s.replace(/\D/g, "");
  if (d && d[0] !== "2" && d[0] !== "6") d = "";
  return d.slice(0, 5);
}

// ---- Bus types (permanent roster info, from the official list) ----
// A bus can have multiple types. Buses not listed here are Standard (no code).
const TYPE_MAP = {};
function assign(nums, types) {
  for (const n of nums) TYPE_MAP[String(n)] = types;
}

// Short Bus (30')
assign(
  [2769, 2770, 2771, 2772, 2774, 2775, 2776, 2777, 2779, 2781, 2782, 2783, 2784, 2797, 2801],
  ["short"]
);
// Coach / Single Door
assign([6378, 6381, 6388, 6485, 6492, 6494, 6497, 6504], ["coach"]);
// Pulse
assign(
  [
    6510, 6511, 6512, 6514, 6515, 6516, 6517, 6518, 6519, 6520, 6521,
    6563, 6564, 6565, 6566, 6567, 6568, 6569, 6570, 6571, 6572, 6573,
  ],
  ["pulse"]
);
// Pulse & Hybrid
assign([25538, 25539, 25545], ["pulse", "hybrid"]);
// Tow truck (named vehicle)
assign(["JUDI"], ["tow"]);

// Returns an array of type ids for the bus (empty array = Standard bus).
export function busTypes(num) {
  return TYPE_MAP[num] || [];
}
