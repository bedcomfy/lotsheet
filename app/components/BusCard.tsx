"use client";

// The Bus Card — the one place a bus number lands from anywhere (header
// search, the phone Fleet tab, Home rows): where the bus sits, its status and
// flags, tonight's lane service, and one-tap actions — quick flags with undo,
// clear, move, and the full flag editor.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Flag, MapPin, MoveRight, Trash2, Undo2 } from "lucide-react";
import { BUS_STATUS_COPY, busDetails, postBusFlags } from "../lib/busDetails";
import {
  commonFlagIds,
  entryHasContent,
  flagName,
  inspectionOptionFromText,
  removeInspection,
} from "../lib/grid";
import { useFlags, useLotSheet } from "../lib/queries";
import { emptyFlagEntry } from "../lib/serviceLaneSetup";
import type { FlagEntry, FlagMap } from "../lib/types";
import { Button, Chip, ResponsiveDialog, StaticChip, StatusBadge } from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import FlagPills from "./FlagPills";
import ManagerPanel from "./ManagerPanelLazy";
import MMoveSheet from "./mapp/MMoveSheet";
import TypeCodes from "./TypeCodes";
import styles from "./BusCard.module.css";

const UNDO_MS = 8000;

function useServiceTonight(bus: string) {
  const { data } = useQuery({
    queryKey: ["m-service-tonight"],
    queryFn: async () => {
      const [fuel, def, farebox] = await Promise.all(
        ["fuel", "def", "farebox"].map((k) =>
          fetch(`/api/state/${k}`).then((r) => (r.ok ? r.json() : { value: null })).catch(() => ({ value: null }))
        )
      );
      return { fuel: fuel.value, def: def.value, farebox: farebox.value };
    },
    staleTime: 15000,
    refetchInterval: 60000,
  });
  return {
    fueled: !!data?.fuel?.entries?.[bus]?.gals,
    defed: !!data?.def?.entries?.[bus]?.gals,
    farebox: data?.farebox?.entries?.[bus]?.yn === "y" || data?.farebox?.entries?.[bus]?.pd === true,
  };
}

// Detail-bearing flags the crew still needs to fill in (reason, tires, type).
function missingDetails(entry: FlagEntry): string[] {
  const missing: string[] = [];
  if (entry.flags.includes("hold") && !(entry.holdReason || "").trim()) missing.push("hold reason");
  if (entry.flags.includes("cards") && !(entry.cardsReason || "").trim()) missing.push("cards reason");
  if (entry.flags.includes("retorque") && !(entry.retorqueTires || []).length) missing.push("retorque tires");
  if (entry.flags.includes("inspection") && !inspectionOptionFromText(entry.inspOption)) missing.push("inspection type");
  return missing;
}

function withoutFlag(entry: FlagEntry, id: string): FlagEntry {
  const next = id === "inspection" ? removeInspection(entry) : { ...entry, flags: entry.flags.filter((f) => f !== id) };
  return {
    ...next,
    holdReason: id === "hold" ? "" : next.holdReason,
    cardsReason: id === "cards" ? "" : next.cardsReason,
    retorqueTires: id === "retorque" ? [] : next.retorqueTires,
  };
}

export interface BusCardProps {
  bus: string;
  onClose: () => void;
  onOpenLotSheet?: (bus: string) => void;
  toast?: (message: string) => void;
}

export default function BusCard({ bus, onClose, onOpenLotSheet, toast }: BusCardProps) {
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { master, label } = useBusMaster();
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<{ before: FlagEntry; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sheet = sheetData?.sheet || null;

  const details = useMemo(() => busDetails(bus, sheet, flags, master, label), [bus, sheet, flags, master, label]);
  const status = BUS_STATUS_COPY[details.status];
  const entry: FlagEntry = flags[bus] || emptyFlagEntry();
  const svc = useServiceTonight(bus);
  const quickFlags = commonFlagIds();
  const missing = missingDetails(entry);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  function patchCache(next: FlagEntry) {
    qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [bus]: next }));
  }

  // Optimistic save with a short undo window; a rejected save reverts and says so.
  async function commit(next: FlagEntry, changeLabel: string, offerUndo = true) {
    const before = entry;
    patchCache(next);
    setError("");
    setNotice("");
    if (offerUndo) {
      setUndo({ before, label: changeLabel });
      clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    }
    const ok = await postBusFlags(bus, next);
    if (!ok) {
      patchCache(before);
      setUndo(null);
      setError("Couldn't save that change — check the connection and try again.");
    }
  }

  function toggleFlag(id: string) {
    const on = entry.flags.includes(id);
    const next = on ? withoutFlag(entry, id) : { ...entry, flags: [...entry.flags, id] };
    void commit(next, `${on ? "Removed" : "Added"} ${flagName(id)}`);
  }

  async function undoLast() {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    const { before } = undo;
    setUndo(null);
    await commit(before, "", false);
  }

  function clearFlags() {
    setConfirmClear(false);
    void commit(emptyFlagEntry(), "Cleared all flags");
  }

  return (
    <>
      <ResponsiveDialog
        isOpen={!editorOpen && !moveOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={`Bus ${details.label}`}
        description={details.location}
        size="md"
        footer={(close) => (
          <div className={styles.footer}>
            <Button variant="primary" onPress={() => setEditorOpen(true)}>
              <Flag aria-hidden="true" /> Edit flags
            </Button>
            <Button onPress={() => setMoveOpen(true)}>
              <MoveRight aria-hidden="true" /> Move
            </Button>
            {onOpenLotSheet && (
              <Button variant="quiet" onPress={() => onOpenLotSheet(bus)}>
                Lot Sheet <ArrowRight aria-hidden="true" />
              </Button>
            )}
            <Button variant="quiet" onPress={close}>Done</Button>
          </div>
        )}
      >
        <div className={styles.body}>
          <div className={styles.identity}>
            <div className={styles.identityLine}>
              <TypeCodes num={bus} variant="ui" />
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              {details.model && <span className={styles.model}>{details.model}</span>}
            </div>
            <span className={styles.where}>
              <MapPin aria-hidden="true" /> {details.location}
            </span>
          </div>

          <section className={styles.section} aria-label="Flags">
            <div className={styles.sectionHead}>
              <h3>Flags</h3>
              {entryHasContent(entry) && !confirmClear && (
                <Button className={styles.clear} variant="quiet" size="sm" onPress={() => setConfirmClear(true)}>
                  <Trash2 aria-hidden="true" /> Clear
                </Button>
              )}
            </div>
            {confirmClear && (
              <div className={styles.inlineConfirm} role="alertdialog" aria-label="Clear every flag from this bus?">
                <span>Clear every flag and note from bus {details.label}? Its location stays.</span>
                <Button size="sm" variant="quiet" onPress={() => setConfirmClear(false)}>Keep</Button>
                <Button size="sm" variant="danger" onPress={clearFlags}>Clear flags</Button>
              </div>
            )}
            <div className={styles.pills}>
              {entryHasContent(entry) ? <FlagPills entry={entry} /> : <StaticChip>No flags</StaticChip>}
            </div>
            <div className={styles.quick} role="group" aria-label="Quick flags">
              {quickFlags.map((id) => {
                const on = entry.flags.includes(id);
                return (
                  <Chip
                    key={id}
                    tone={on ? "accent" : "neutral"}
                    isSelected={on}
                    aria-pressed={on}
                    onPress={() => toggleFlag(id)}
                  >
                    {flagName(id)}
                  </Chip>
                );
              })}
            </div>
            {missing.length > 0 && (
              <button type="button" className={styles.missing} onClick={() => setEditorOpen(true)}>
                Add {missing.join(", ")} in Edit flags <ArrowRight aria-hidden="true" />
              </button>
            )}
            {undo && (
              <div className={styles.undo} role="status">
                <span>{undo.label}</span>
                <Button size="sm" variant="quiet" onPress={undoLast}>
                  <Undo2 aria-hidden="true" /> Undo
                </Button>
              </div>
            )}
            {notice && <div className={styles.notice} role="status">{notice}</div>}
            {error && <div className={styles.error} role="alert">{error}</div>}
          </section>

          <section className={styles.service} aria-label="Tonight's service">
            <span className={styles.serviceLabel}>Tonight&apos;s service</span>
            <b className={styles.serviceItem} data-complete={svc.fueled}>Fueled {svc.fueled ? "✓" : "—"}</b>
            <b className={styles.serviceItem} data-complete={svc.defed}>DEF {svc.defed ? "✓" : "—"}</b>
            <b className={styles.serviceItem} data-complete={svc.farebox}>Farebox {svc.farebox ? "✓" : "—"}</b>
          </section>
        </div>
      </ResponsiveDialog>

      {moveOpen && (
        <MMoveSheet
          bus={bus}
          onDone={(message) => {
            setMoveOpen(false);
            setNotice(message);
            toast?.(message);
          }}
          onClose={() => setMoveOpen(false)}
        />
      )}

      {editorOpen && (
        <ManagerPanel
          flags={flags}
          initialBus={bus}
          initialDetails={details}
          onBusFlagsUpdated={(b, e) => qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [b]: e }))}
          onOpenLotSheet={onOpenLotSheet}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}
