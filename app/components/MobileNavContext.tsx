"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface MobileLotStatus {
  usable: number;
  outOfService: number;
}

interface MobileLotActions {
  openStatus: () => void;
  openSearch: () => void;
}

interface MobileNavValue {
  lotStatus: MobileLotStatus | null;
  setLotStatus: (status: MobileLotStatus | null) => void;
  registerLotActions: (actions: MobileLotActions | null) => void;
  openLotStatus: () => void;
  openLotSearch: () => void;
}

const MobileNavContext = createContext<MobileNavValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [lotStatus, setLotStatusState] = useState<MobileLotStatus | null>(null);
  const lotActions = useRef<MobileLotActions | null>(null);

  const setLotStatus = useCallback((status: MobileLotStatus | null) => {
    setLotStatusState((current) => {
      if (
        current &&
        status &&
        current.usable === status.usable &&
        current.outOfService === status.outOfService
      ) {
        return current;
      }
      return status;
    });
  }, []);

  const registerLotActions = useCallback((actions: MobileLotActions | null) => {
    lotActions.current = actions;
  }, []);

  const openLotStatus = useCallback(() => lotActions.current?.openStatus(), []);
  const openLotSearch = useCallback(() => lotActions.current?.openSearch(), []);

  const value = useMemo(
    () => ({ lotStatus, setLotStatus, registerLotActions, openLotStatus, openLotSearch }),
    [lotStatus, openLotSearch, openLotStatus, registerLotActions, setLotStatus],
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavValue {
  const value = useContext(MobileNavContext);
  if (!value) throw new Error("useMobileNav must be used inside MobileNavProvider");
  return value;
}
