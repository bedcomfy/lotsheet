"use client";

// The Bus Card — the app's heart. Any bus number, from anywhere, opens this
// same bottom sheet: where the bus sits, its flags, tonight's lane service,
// and Flag (the full desktop flag editor, opened straight on this bus).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLotSheet, useFlags } from "../../lib/queries";
import { fleetBusLocations } from "../../lib/fleetStats";
import { flagName } from "../../lib/grid";
import { useBusMaster } from "../BusMasterProvider";
import ManagerPanel from "../ManagerPanelLazy";
import MMoveSheet from "./MMoveSheet";
import type { FlagEntry, FlagMap } from "../../lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Flag, MoveRight } from "lucide-react";
import { Button, ResponsiveDialog, StaticChip } from "../../ui";
import styles from "./MApp.module.css";

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

export default function MBusCard({ bus, onClose, toast }: { bus: string; onClose: () => void; toast: (msg: string) => void }) {
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { label } = useBusMaster();
  const qc = useQueryClient();
  const [flagOpen, setFlagOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const sheet = sheetData?.sheet || null;

  const where = useMemo(() => {
    const locations = fleetBusLocations(sheet, flags)[bus] || [];
    return locations.length ? locations.join(" · ") : "Not placed";
  }, [sheet, flags, bus]);

  const entry = flags[bus];
  const flagIds = entry?.flags || [];
  const svc = useServiceTonight(bus);

  function onBusFlagsUpdated(b: string, e: FlagEntry) {
    qc.setQueryData<FlagMap>(["flags"], (prev = {}) => ({ ...prev, [b]: e }));
  }

  return (
    <>
      <ResponsiveDialog
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={`Bus ${label(bus)}`}
        description={where}
        size="md"
        footer={(close) => (
          <>
            <Button variant="primary" onPress={() => setFlagOpen(true)}>
              <Flag aria-hidden="true" /> Flags
            </Button>
            <Button onPress={() => setMoveOpen(true)}>
              <MoveRight aria-hidden="true" /> Move
            </Button>
            <Button onPress={close}>Done</Button>
          </>
        )}
      >
        <div className={styles.cardBody}>
        <div className={styles.flags}>
          {flagIds.length === 0 && <StaticChip>No flags</StaticChip>}
          {flagIds.map((id) => (
            <StaticChip tone="danger" key={id}>{flagName(id)}</StaticChip>
          ))}
          {entry?.note && <StaticChip>{entry.note}</StaticChip>}
          {entry?.holdReason && <StaticChip tone="warning">Hold: {entry.holdReason}</StaticChip>}
        </div>
        <div className={styles.service}>
          <span className={styles.serviceLabel}>Tonight&apos;s service</span>
          <b className={styles.serviceItem} data-complete={svc.fueled}>Fueled {svc.fueled ? "✓" : "—"}</b>
          <b className={styles.serviceItem} data-complete={svc.defed}>DEF {svc.defed ? "✓" : "—"}</b>
          <b className={styles.serviceItem} data-complete={svc.farebox}>Farebox {svc.farebox ? "✓" : "—"}</b>
        </div>
        </div>
      </ResponsiveDialog>

      {moveOpen && (
        <MMoveSheet
          bus={bus}
          onDone={(msg) => {
            setMoveOpen(false);
            toast(msg);
            onClose();
          }}
          onClose={() => setMoveOpen(false)}
        />
      )}

      {flagOpen && (
        <ManagerPanel
          flags={flags}
          initialBus={bus}
          onBusFlagsUpdated={onBusFlagsUpdated}
          onClose={() => setFlagOpen(false)}
        />
      )}
    </>
  );
}
