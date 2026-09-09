"use client";

// A group of buses (Missing, In shop, Flagged, …) as an actionable list: every
// row opens the Bus Card, and the footer acts on the whole group — move them
// all to a lot, flag them all, or clear their flags — with an inline confirm
// and a progress count. Shared by the desktop Home and the phone Tonight board.

import { useState } from "react";
import type { Key } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Flag, MoveRight, Trash2 } from "lucide-react";
import {
  BULK_MOVE_TARGETS,
  addFlagToBuses,
  clearFlagsOnBuses,
  moveBusesToLot,
} from "../lib/bulkBus";
import { commonFlagIds, entryHasContent, flagName, flagsFullDisplay } from "../lib/grid";
import type { FlagEntry, FlagMap, LotKey } from "../lib/types";
import { ActionMenu, Button, Pressable, ResponsiveDialog } from "../ui";
import styles from "./FleetGroupDialog.module.css";

type Plan =
  | { kind: "move"; key: LotKey; label: string }
  | { kind: "flag"; id: string; label: string }
  | { kind: "clear" };

export interface FleetGroupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  buses: string[];
  flags: FlagMap;
  locations: Record<string, string[]>;
  // Missing buses have no location by definition; skip the lookup.
  noLocation?: boolean;
  onOpenBus: (bus: string) => void;
}

export default function FleetGroupDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  buses,
  flags,
  locations,
  noLocation,
  onOpenBus,
}: FleetGroupDialogProps) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const flaggedCount = buses.filter((bus) => entryHasContent(flags[bus])).length;
  const busy = progress !== null;

  function patchFlag(bus: string, entry: FlagEntry) {
    qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [bus]: entry }));
  }

  function describe(p: Plan): string {
    const n = `${buses.length} bus${buses.length === 1 ? "" : "es"}`;
    if (p.kind === "move") return `Move ${n} to ${p.label}?`;
    if (p.kind === "flag") return `Add ${p.label} to ${n}?`;
    return `Clear every flag and note from ${flaggedCount} bus${flaggedCount === 1 ? "" : "es"}? Locations stay.`;
  }

  async function run() {
    if (!plan) return;
    const current = plan;
    setPlan(null);
    setError("");
    setNotice("");
    setProgress({ done: 0, total: buses.length });
    const onProgress = (done: number) => setProgress({ done, total: buses.length });
    const result =
      current.kind === "move"
        ? await moveBusesToLot(buses, current.key)
        : current.kind === "flag"
          ? await addFlagToBuses(buses, current.id, flags, patchFlag, onProgress)
          : await clearFlagsOnBuses(buses, flags, patchFlag, onProgress);
    setProgress(null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["sheet"] }),
      qc.invalidateQueries({ queryKey: ["flags"] }),
    ]);
    if (result.failed.length) {
      setError(`${result.failed.length} bus${result.failed.length === 1 ? "" : "es"} did not save: ${result.failed.join(", ")}. Check the connection and try again.`);
    } else if (current.kind === "move") {
      setNotice(`Moved ${buses.length} bus${buses.length === 1 ? "" : "es"} to ${current.label}.`);
    } else if (current.kind === "flag") {
      setNotice(`Added ${current.label} to ${buses.length} bus${buses.length === 1 ? "" : "es"}.`);
    } else {
      setNotice("Flags cleared.");
    }
  }

  const footer = plan ? (
    <div className={`${styles.footer} ${styles.confirm}`} role="alertdialog" aria-label={describe(plan)}>
      <span className={styles.confirmText}>{describe(plan)}</span>
      <div className={styles.footerActions}>
        <Button variant="quiet" onPress={() => setPlan(null)}>Cancel</Button>
        <Button variant={plan.kind === "clear" ? "danger" : "primary"} onPress={run}>
          {plan.kind === "move" ? "Move all" : plan.kind === "flag" ? "Flag all" : "Clear all"}
        </Button>
      </div>
    </div>
  ) : (
    <div className={styles.footer}>
      <div className={styles.bulk} role="group" aria-label="Actions for every bus in this list">
        <ActionMenu
          label={<><MoveRight aria-hidden="true" /> Move all to…</>}
          buttonSize="sm"
          items={BULK_MOVE_TARGETS.map((target) => ({ id: target.key, label: target.label, isDisabled: busy || buses.length === 0 }))}
          onAction={(key: Key) => {
            const target = BULK_MOVE_TARGETS.find((item) => item.key === key);
            if (target) setPlan({ kind: "move", key: target.key, label: target.label });
          }}
        />
        <ActionMenu
          label={<><Flag aria-hidden="true" /> Flag all…</>}
          buttonSize="sm"
          items={commonFlagIds().map((id) => ({ id, label: flagName(id), isDisabled: busy || buses.length === 0 }))}
          onAction={(key: Key) => setPlan({ kind: "flag", id: String(key), label: flagName(String(key)) })}
        />
        {flaggedCount > 0 && (
          <Button size="sm" variant="quiet" className={styles.clear} isDisabled={busy} onPress={() => setPlan({ kind: "clear" })}>
            <Trash2 aria-hidden="true" /> Clear flags on all
          </Button>
        )}
      </div>
      <Button variant="primary" onPress={() => onOpenChange(false)}>Done</Button>
    </div>
  );

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="md"
      footer={footer}
    >
      <div className={styles.summary}>
        <strong>{buses.length}</strong>
        <span>bus{buses.length === 1 ? "" : "es"}</span>
        {progress && <span className={styles.progress} role="status">Saving {progress.done}/{progress.total}…</span>}
      </div>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.list}>
        {buses.length === 0 && <p className={styles.empty}>No buses in this group.</p>}
        {buses.map((bus) => {
          const why = flags[bus] ? flagsFullDisplay(flags[bus]) : "";
          const where = noLocation ? "No current location" : (locations[bus] || ["No current location"]).join(" / ");
          return (
            <Pressable className={styles.row} key={bus} onPress={() => onOpenBus(bus)}>
              <span className={styles.rowMain}>
                <strong>{bus}</strong>
                <small>{where}</small>
                {why && <em>{why}</em>}
              </span>
              <ArrowRight aria-hidden="true" />
            </Pressable>
          );
        })}
      </div>
    </ResponsiveDialog>
  );
}
