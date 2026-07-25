"use client";

// The Lot Sheet's status modals (tapped from the toolbar chips), extracted
// from LotSheet.tsx verbatim. Render-only: all state stays in LotSheet.

import { Flag } from "lucide-react";
import { flagsFullDisplay } from "../lib/grid";
import type { FlagEntry } from "../lib/types";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import { Button, Pressable, ResponsiveDialog } from "../ui";
import styles from "./LotStatusModals.module.css";

// Which active buses aren't anywhere on the sheet (tap the stats chip).
export function MissingBusesModal({ missingBuses, accountedBuses, flagFor, onEditFlags, onClose }: {
  missingBuses: string[];
  accountedBuses: string[];
  flagFor: (num: string) => FlagEntry;
  onEditFlags: (bus: string) => void;
  onClose: () => void;
}) {
  const { label: busLabel } = useBusMaster();
  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Missing buses"
      description={
        <>
          {missingBuses.length
            ? `${missingBuses.length} active bus${missingBuses.length === 1 ? "" : "es"} unaccounted for.`
            : "Every active bus is accounted for."}
          {accountedBuses.length
            ? ` ${accountedBuses.length} off property / in shop.`
            : ""}
        </>
      }
      size="md"
      footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
    >
      <div className={styles.list}>
        {[...missingBuses, ...accountedBuses].map((bus, i) => {
          const fdisp = flagsFullDisplay(flagFor(bus));
          const firstAccounted = i === missingBuses.length && accountedBuses.length > 0;
          return (
            <div key={bus}>
              {firstAccounted && (
                <div className={styles.section}>Off property / in shop (not missing)</div>
              )}
              <div className={styles.row}>
                <div className={styles.rowInfo}>
                  <span className={styles.bus}>{busLabel(bus)}</span>
                  <TypeCodes num={bus} variant="ui" />
                  {fdisp && <span className={styles.flag}>{fdisp}</span>}
                </div>
                <div className={styles.actions}>
                  <Pressable
                    className={styles.edit}
                    onPress={() => onEditFlags(bus)} /* stacks on top — Done returns here */
                    aria-label="Edit flags"
                  >
                    <Flag size={13} />
                  </Pressable>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ResponsiveDialog>
  );
}

// Usable / Out of Service detail (tapped from the service chips): where each
// bus is and why it's off the grid.
export function ServiceDetailModal({ kind, readyForService, notReadyForService, fleetLocations, flagFor, onEditFlags, onClose }: {
  kind: "usable" | "outOfService";
  readyForService: Iterable<string>;
  notReadyForService: Iterable<string>;
  fleetLocations: Record<string, string[]>;
  flagFor: (num: string) => FlagEntry;
  onEditFlags: (bus: string) => void;
  onClose: () => void;
}) {
  const { label: busLabel } = useBusMaster();
  const isOut = kind === "outOfService";
  const buses = [...(isOut ? notReadyForService : readyForService)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={isOut ? "Out of Service" : "Usable buses"}
      description={
        isOut
          ? `${buses.length} active bus${buses.length === 1 ? "" : "es"} off the service grid — where they are and why.`
          : `${buses.length} active bus${buses.length === 1 ? "" : "es"} on the service grid.`
      }
      size="md"
      footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
    >
      <div className={styles.list}>
        {buses.length === 0 && (
          <div className={styles.empty}>
            {isOut ? "Every active bus is on the grid." : "No buses on the grid yet."}
          </div>
        )}
        {buses.map((bus) => {
          const where = (fleetLocations[bus] || []).join(" / ");
          const why = flagsFullDisplay(flagFor(bus));
          return (
            <div className={styles.detailRow} key={bus}>
              <div className={styles.detailMain}>
                <span className={styles.bus}>{busLabel(bus)}</span>
                <TypeCodes num={bus} variant="ui" />
                <Pressable
                  className={styles.edit}
                  onPress={() => onEditFlags(bus)} /* stacks on top — Done returns here */
                  aria-label="Edit flags"
                >
                  <Flag size={13} />
                </Pressable>
              </div>
              <div className={styles.detailMeta}>
                <span className={styles.where}>{where || "Not placed"}</span>
                {why && <span className={styles.why}>{why}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </ResponsiveDialog>
  );
}
