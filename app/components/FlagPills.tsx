"use client";

import { flagTier, flagName, retorqueTiresDisplay, inspMilesDisplay } from "../lib/grid";
import type { FlagEntry } from "../lib/types";

// Pill color by severity — one shared visual language across every menu.
const TIER_CLASS: Record<string, string> = { high: "safety", med: "maintenance", low: "service" };
function tierRank(tier: string): number {
  return tier === "high" ? 0 : tier === "med" ? 1 : 2;
}

// One flag's short label, with its detail folded in (hold reason, inspection
// type, retorque tires).
function pillText(id: string, entry: FlagEntry): string {
  if (id === "retorque") return `Retorque · ${retorqueTiresDisplay(entry.retorqueTires)}`;
  if (id === "hold") return (entry.holdReason || "").trim() ? `Hold · ${entry.holdReason}` : "Hold";
  if (id === "inspection") {
    const o = (entry.inspOption || "").trim() || inspMilesDisplay(entry);
    return o ? `Inspection · ${o}` : "Inspection";
  }
  return flagName(id);
}

// A bus's flags as severity-colored pills (most-serious first), optionally with
// its free-text note as a plain pill. Renders nothing if there's nothing to show.
export default function FlagPills({ entry, showNote = true }: { entry?: FlagEntry | null; showNote?: boolean }) {
  if (!entry) return null;
  const flags = (entry.flags || []).slice().sort((a, b) => tierRank(flagTier(a)) - tierRank(flagTier(b)));
  const note = (entry.note || "").trim();
  if (flags.length === 0 && !(showNote && note)) return null;
  return (
    <>
      {flags.map((id) => (
        <span key={id} className={`fpill fpill--${TIER_CLASS[flagTier(id)]}`}>
          {pillText(id, entry)}
        </span>
      ))}
      {showNote && note && <span className="fpill">“{note}”</span>}
    </>
  );
}
