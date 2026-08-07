"use client";

import type { CSSProperties } from "react";
import { flagTier, flagName, retorqueTiresDisplay, inspMilesDisplay, flagColorStyle } from "../lib/grid";
import { customNoteItems, operationalFlagIds } from "../lib/customNoteFlags";
import type { FlagEntry } from "../lib/types";
import styles from "./FlagPills.module.css";

function tierRank(tier: string): number {
  return tier === "high" ? 0 : tier === "med" ? 1 : 2;
}

// One flag's short label, with its detail folded in (hold reason, inspection
// type, retorque tires).
function pillText(id: string, entry: FlagEntry): string {
  if (id === "retorque") return `Retorque · ${retorqueTiresDisplay(entry.retorqueTires)}`;
  if (id === "hold") return (entry.holdReason || "").trim() ? `Hold · ${entry.holdReason}` : "Hold";
  if (id === "inspection") {
    const miles = inspMilesDisplay(entry);
    return miles ? `Inspection · ${miles}` : "Inspection";
  }
  return flagName(id);
}

// A bus's flags as severity-colored pills (most-serious first), optionally with
// every custom note as its own neutral pill. Legacy single-note records are
// folded into the same list so old and new data look identical.
export default function FlagPills({ entry, showNote = true }: { entry?: FlagEntry | null; showNote?: boolean }) {
  if (!entry) return null;
  const flags = operationalFlagIds(entry.flags)
    .slice()
    .sort((a, b) => tierRank(flagTier(a)) - tierRank(flagTier(b)));
  const notes = showNote ? customNoteItems(entry) : [];
  if (flags.length === 0 && notes.length === 0) return null;
  return (
    <>
      {flags.map((id) => (
        <span
          key={id}
          className={styles.pill}
          style={flagColorStyle(id) as CSSProperties}
        >
          {pillText(id, entry)}
        </span>
      ))}
      {notes.map((note) => (
        <span className={`${styles.pill} ${styles.note}`} key={note.id}>
          “{note.text}”
        </span>
      ))}
    </>
  );
}
