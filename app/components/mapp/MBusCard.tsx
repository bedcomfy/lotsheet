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
      <div className="mscrim" onClick={onClose} />
      <div className="mcard" role="dialog" aria-label={`Bus ${bus}`}>
        <div className="mcard__grab" />
        <div className="mcard__body">
        <div className="mcard__top">
          <span className="mcard__num">{label(bus)}</span>
          <span className="mcard__where">{where}</span>
        </div>
        <div className="mcard__flags">
          {flagIds.length === 0 && <span className="mfchip mfchip--dim">No flags</span>}
          {flagIds.map((id) => (
            <span className="mfchip mfchip--bad" key={id}>{flagName(id)}</span>
          ))}
          {entry?.note && <span className="mfchip mfchip--dim">“{entry.note}”</span>}
          {entry?.holdReason && <span className="mfchip mfchip--dim">Hold: {entry.holdReason}</span>}
        </div>
        <div className="mcard__tonight">
          <span>Tonight:</span>
          <b className={svc.fueled ? "y" : "n"}>Fueled {svc.fueled ? "✓" : "—"}</b>
          <b className={svc.defed ? "y" : "n"}>DEF {svc.defed ? "✓" : "—"}</b>
          <b className={svc.farebox ? "y" : "n"}>Farebox {svc.farebox ? "✓" : "—"}</b>
        </div>
        </div>
        <div className="mcard__acts mcard__acts--three mcard__footer">
          <button type="button" className="mactb mactb--hot" onClick={() => setFlagOpen(true)}>
            ⚑ Flags
          </button>
          <button type="button" className="mactb" onClick={() => setMoveOpen(true)}>
            ➜ Move
          </button>
          <button type="button" className="mactb" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

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
