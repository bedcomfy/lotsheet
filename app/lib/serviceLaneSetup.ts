import {
  inspectionOptionFromText,
  removeInspection,
  retorqueTiresDisplay,
  setInspectionOption,
} from "./grid";
import type { FlagEntry, FlagMap } from "./types";

export const SERVICE_LANE_FLAGS = [
  "hold",
  "cards",
  "inspection",
  "retorque",
] as const;

export type ServiceLaneFlagId = (typeof SERVICE_LANE_FLAGS)[number];

// Holds and Cards are one lane category: every one of those buses gets brought
// to cards, and each carries a reason. A bus is one or the other, never both.
export const BRING_TO_CARDS_FLAGS = ["hold", "cards"] as const;
export type BringToCardsKind = (typeof BRING_TO_CARDS_FLAGS)[number];

const SERVICE_LANE_FLAG_SET = new Set<string>(SERVICE_LANE_FLAGS);

export function emptyFlagEntry(): FlagEntry {
  return {
    flags: [],
    note: "",
    inspMiles: null,
    holdReason: "",
    cardsReason: "",
    retorqueTires: [],
    inspOption: "",
  };
}

export function hasServiceLaneFlags(entry: FlagEntry | null | undefined): boolean {
  return !!entry?.flags?.some((id) => SERVICE_LANE_FLAG_SET.has(id));
}

export function serviceLaneAssignmentCount(flags: FlagMap | null | undefined): number {
  return Object.values(flags || {}).reduce(
    (total, entry) =>
      total + (entry?.flags || []).filter((id) => SERVICE_LANE_FLAG_SET.has(id)).length,
    0,
  );
}

export function serviceLaneBusCount(flags: FlagMap | null | undefined): number {
  return Object.values(flags || {}).filter(hasServiceLaneFlags).length;
}

// Which Bring-to-Cards kind a bus carries (Hold outranks Cards), if any.
export function bringToCardsKind(entry: FlagEntry | null | undefined): BringToCardsKind | null {
  if (entry?.flags?.includes("hold")) return "hold";
  if (entry?.flags?.includes("cards")) return "cards";
  return null;
}

// The reason attached to the bus's Bring-to-Cards kind.
export function bringToCardsReason(entry: FlagEntry | null | undefined): string {
  const kind = bringToCardsKind(entry);
  if (kind === "hold") return (entry?.holdReason || "").trim();
  if (kind === "cards") return (entry?.cardsReason || "").trim();
  return "";
}

// Make a bus a Hold or a Cards bus (never both). Switching kinds carries the
// reason across so nothing typed is lost.
export function setBringToCardsKind(entry: FlagEntry, kind: BringToCardsKind): FlagEntry {
  const reason = bringToCardsReason(entry);
  const flags = entry.flags.filter((id) => id !== "hold" && id !== "cards");
  return {
    ...entry,
    flags: [...flags, kind],
    holdReason: kind === "hold" ? reason : "",
    cardsReason: kind === "cards" ? reason : "",
  };
}

export function setBringToCardsReason(entry: FlagEntry, reason: string): FlagEntry {
  const kind = bringToCardsKind(entry);
  if (kind === "hold") return { ...entry, holdReason: reason };
  if (kind === "cards") return { ...entry, cardsReason: reason };
  return entry;
}

// Remove only the flags owned by the nightly service-lane setup. Unrelated
// maintenance flags and custom-note flags survive the replacement.
export function clearServiceLaneFlags(entry: FlagEntry): FlagEntry {
  const withoutInspection = removeInspection(entry);
  return {
    ...withoutInspection,
    flags: (withoutInspection.flags || []).filter(
      (id) => !SERVICE_LANE_FLAG_SET.has(id) && id !== "followup",
    ),
    holdReason: "",
    cardsReason: "",
    retorqueTires: [],
  };
}

export function removeStagedServiceFlag(
  entry: FlagEntry,
  flagId: ServiceLaneFlagId,
): FlagEntry {
  if (flagId === "inspection") {
    const next = removeInspection(entry);
    return { ...next, flags: next.flags.filter((id) => id !== "followup") };
  }
  return {
    ...entry,
    flags: entry.flags.filter((id) => id !== flagId),
    holdReason: flagId === "hold" ? "" : entry.holdReason,
    cardsReason: flagId === "cards" ? "" : entry.cardsReason,
    retorqueTires: flagId === "retorque" ? [] : entry.retorqueTires,
  };
}

export function addStagedServiceFlag(
  entry: FlagEntry,
  flagId: ServiceLaneFlagId,
): FlagEntry {
  if (entry.flags.includes(flagId)) return entry;
  return { ...entry, flags: [...entry.flags, flagId] };
}

// Replace the service-lane slice while preserving the rest of a bus's latest
// entry. This is intentionally pure so the review screen, API caller, and tests
// all use exactly the same merge rule.
export function mergeServiceLaneSetup(current: FlagEntry, staged?: FlagEntry): FlagEntry {
  let next = clearServiceLaneFlags(current);
  if (!staged) return next;

  const stagedFlags = new Set(staged.flags || []);
  const simpleFlags = ["hold", "cards"] as const;
  next = {
    ...next,
    flags: Array.from(
      new Set([
        ...next.flags,
        ...simpleFlags.filter((id) => stagedFlags.has(id)),
      ]),
    ),
    holdReason: stagedFlags.has("hold") ? staged.holdReason || "" : "",
    cardsReason: stagedFlags.has("cards") ? staged.cardsReason || "" : "",
  };

  if (stagedFlags.has("inspection")) {
    const option = inspectionOptionFromText(staged.inspOption);
    next = option
      ? setInspectionOption(next, option.id)
      : { ...next, flags: Array.from(new Set([...next.flags, "inspection"])) };
    if (stagedFlags.has("followup")) {
      next = { ...next, flags: Array.from(new Set([...next.flags, "followup"])) };
    }
  }

  if (stagedFlags.has("retorque")) {
    next = {
      ...next,
      flags: Array.from(new Set([...next.flags, "retorque"])),
      retorqueTires: staged.retorqueTires || [],
    };
  }

  return next;
}

export function serviceLaneSetupIssues(staged: FlagMap): string[] {
  const issues: string[] = [];
  for (const [bus, entry] of Object.entries(staged)) {
    if (entry.flags.includes("inspection") && !inspectionOptionFromText(entry.inspOption)) {
      issues.push(`${bus} needs an inspection type`);
    }
    if (entry.flags.includes("retorque") && !(entry.retorqueTires || []).length) {
      issues.push(`${bus} needs retorque tires`);
    }
  }
  return issues;
}

// Just the service-lane slice of a bus's live entry, shaped the way the wizard
// stages it — so tonight's setup can start from what is already on the lane.
export function stageServiceLaneSlice(entry: FlagEntry | null | undefined): FlagEntry | null {
  if (!entry || !hasServiceLaneFlags(entry)) return null;
  return mergeServiceLaneSetup(emptyFlagEntry(), entry);
}

export function stageCurrentServiceLane(flags: FlagMap | null | undefined): FlagMap {
  const staged: FlagMap = {};
  for (const [bus, entry] of Object.entries(flags || {})) {
    const slice = stageServiceLaneSlice(entry);
    if (slice) staged[bus] = slice;
  }
  return staged;
}

// One line describing a bus's lane assignments: "Hold (Parts) · A-3 · Fronts".
export function describeServiceLaneEntry(entry: FlagEntry | null | undefined): string {
  if (!entry) return "";
  const parts: string[] = [];
  const kind = bringToCardsKind(entry);
  if (kind) {
    const reason = bringToCardsReason(entry);
    parts.push(`${kind === "hold" ? "Hold" : "Card"}${reason ? ` (${reason})` : ""}`);
  }
  if (entry.flags.includes("inspection")) {
    const option = inspectionOptionFromText(entry.inspOption);
    parts.push(option ? option.label : "Inspection");
    if (entry.flags.includes("followup")) parts.push("Follow up");
  }
  if (entry.flags.includes("retorque")) {
    parts.push(`Retorque ${retorqueTiresDisplay(entry.retorqueTires) || "(tires?)"}`);
  }
  return parts.join(" · ");
}

export type ServiceLaneChange = "add" | "change" | "drop" | "keep";

export interface ServiceLaneDiffRow {
  bus: string;
  change: ServiceLaneChange;
  before: FlagEntry | null;
  after: FlagEntry | null;
}

function laneSignature(entry: FlagEntry | null): string {
  if (!entry) return "";
  return JSON.stringify({
    flags: [...entry.flags].sort(),
    hold: (entry.holdReason || "").trim(),
    cards: (entry.cardsReason || "").trim(),
    insp: inspectionOptionFromText(entry.inspOption)?.id || "",
    tires: [...(entry.retorqueTires || [])].sort(),
  });
}

// What applying `staged` would do to the live lane, bus by bus. Both sides are
// reduced to their lane slice first so unrelated flags never show as changes.
export function diffServiceLaneSetup(
  current: FlagMap | null | undefined,
  staged: FlagMap | null | undefined,
): ServiceLaneDiffRow[] {
  const buses = new Set([
    ...Object.keys(current || {}).filter((bus) => hasServiceLaneFlags(current?.[bus])),
    ...Object.keys(staged || {}).filter((bus) => hasServiceLaneFlags(staged?.[bus])),
  ]);
  const rows: ServiceLaneDiffRow[] = [];
  for (const bus of buses) {
    const before = stageServiceLaneSlice(current?.[bus]);
    const after = stageServiceLaneSlice(staged?.[bus]);
    const change: ServiceLaneChange = !before
      ? "add"
      : !after
        ? "drop"
        : laneSignature(before) === laneSignature(after)
          ? "keep"
          : "change";
    rows.push({ bus, change, before, after });
  }
  return rows.sort((a, b) => a.bus.localeCompare(b.bus, undefined, { numeric: true }));
}
