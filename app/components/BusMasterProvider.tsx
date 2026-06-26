"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { DEFAULT_MASTER, busHelpers } from "../lib/buses";
import type { BusMaster } from "../lib/types";

type BusHelpers = ReturnType<typeof busHelpers>;
export interface BusMasterContextValue extends BusHelpers {
  master: BusMaster;
  setMaster: Dispatch<SetStateAction<BusMaster>>;
  ready: boolean;
}

const Ctx = createContext<BusMasterContextValue | null>(null);

// Provides the live bus master list (numbers, types, names) to the whole app.
// Starts from the built-in default (so first render matches the server and
// nothing flashes), then loads the saved copy from /api/buses.
export function BusMasterProvider({ children }: { children: ReactNode }) {
  const [master, setMaster] = useState<BusMaster>(DEFAULT_MASTER);
  const [ready, setReady] = useState(false); // saved copy has loaded (or failed)

  useEffect(() => {
    let alive = true;
    fetch("/api/buses")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d && d.master && Array.isArray(d.master.buses)) setMaster(d.master);
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<BusMasterContextValue>(
    () => ({ master, setMaster, ready, ...busHelpers(master) }),
    [master, ready]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Live bus helpers. Falls back to the default seed if used outside the provider.
export function useBusMaster(): BusMasterContextValue {
  return (
    useContext(Ctx) || {
      master: DEFAULT_MASTER,
      setMaster: () => {},
      ready: true,
      ...busHelpers(DEFAULT_MASTER),
    }
  );
}
