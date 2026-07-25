"use client";

// The Lot Sheet's SHOP menu — edit Apron / Bays / Cards without leaving the
// page. Extracted from LotSheet.tsx verbatim; all state stays in LotSheet and
// arrives through props, so behavior is identical.

import { Plus } from "lucide-react";
import { flagsFullDisplay } from "../lib/grid";
import type { FlagEntry, FlagMap } from "../lib/types";
import { useBusMaster } from "./BusMasterProvider";
import { Button, Pressable, ResponsiveDialog } from "../ui";
import styles from "./ShopMenu.module.css";

const BAY_SPOTS = 10; // the shop's fixed bays (shared with the Turnover sheet)

interface ShopMenuProps {
  inShopCount: number | string;
  bays: string[]; // sheet.lots.bay
  flags: FlagMap;
  flagFor: (num: string) => FlagEntry;
  lotList: (key: string) => string[];
  foundBus: string;
  onEditLot: (key: string) => void;
  onEditBay: (index: number) => void;
  onClose: () => void;
}

export default function ShopMenu({ inShopCount, bays, flags, flagFor, lotList, foundBus, onEditLot, onEditBay, onClose }: ShopMenuProps) {
  const { label: busLabel } = useBusMaster();
  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Shop"
      description={`${inShopCount} bus${inShopCount === 1 ? "" : "es"} inside · shared live with the Shop page`}
      size="lg"
      footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
    >
      <div className={styles.menu}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Apron <span className={styles.count}>({lotList("apron").length})</span></span>
            <Button size="sm" onPress={() => onEditLot("apron")}>
              Edit
            </Button>
          </div>
          <div className={styles.busChips}>
            {lotList("apron").length === 0 && <span className={styles.empty}>No buses on the apron.</span>}
            {lotList("apron").map((b, i) => {
              const f = flagsFullDisplay(flagFor(b));
              return (
                <span
                  key={`a${i}`}
                  className={`${styles.busChip} ${!!foundBus && b === foundBus ? styles.found : ""}`}
                >
                  <strong>{busLabel(b)}</strong>
                  {f && <span className={styles.flags}>{f}</span>}
                </span>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>Bays</div>
          <div className={styles.slots}>
            {Array.from({ length: BAY_SPOTS }, (_, i) => {
              const b = bays[i] || "";
              const xed = b === "X";
              const entry = b && !xed ? flags[b] : undefined;
              // Full flags (hold reason, inspection option, the whole note)
              // — the most important info for a shop bus.
              const disp = entry ? flagsFullDisplay(entry) : "";
              const rfs = !!entry?.flags?.includes("rfs");
              const isFound = !!foundBus && b === foundBus;
              return (
                <Pressable
                  key={`bay${i}`}
                  className={`${styles.slot} ${b && !xed ? styles.slotFilled : ""} ${
                    xed ? styles.slotBlocked : ""
                  } ${rfs ? styles.ready : ""} ${isFound ? styles.found : ""}`}
                  onPress={() => onEditBay(i)}
                >
                  <span className={styles.slotLabel}>BAY {i + 1}</span>
                  {xed ? (
                    <span className={styles.blocked}>X</span>
                  ) : b ? (
                    <>
                      <span className={styles.slotBus}>{busLabel(b)}</span>
                      {disp && <span className={styles.slotFlag}>{disp}</span>}
                    </>
                  ) : (
                    <span className={styles.add}>
                      <Plus size={15} />
                    </span>
                  )}
                </Pressable>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Cards <span className={styles.count}>({lotList("cards").length})</span></span>
            <Button size="sm" onPress={() => onEditLot("cards")}>
              Edit
            </Button>
            <span className={styles.legend}>
              <span className={styles.legendDot} /> Ready for Service
            </span>
          </div>
          <div className={styles.busChips}>
            {lotList("cards").length === 0 && <span className={styles.empty}>No buses in cards.</span>}
            {lotList("cards").map((b, i) => {
              const rfs = !!flags[b]?.flags?.includes("rfs");
              const f = flagsFullDisplay(flagFor(b));
              return (
                <span
                  key={`c${i}`}
                  className={`${styles.busChip} ${rfs ? styles.ready : ""} ${
                    !!foundBus && b === foundBus ? styles.found : ""
                  }`}
                >
                  <strong>{busLabel(b)}</strong>
                  {f && <span className={styles.flags}>{f}</span>}
                </span>
              );
            })}
          </div>
        </section>
      </div>
    </ResponsiveDialog>
  );
}
