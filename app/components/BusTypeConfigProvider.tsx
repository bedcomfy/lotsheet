"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { applyBusTypeConfig } from "../lib/grid";

// Loads the saved bus-type appearance overrides (corner code + colour) before
// the sheets render, so the Lot Sheet shows the configured look with no flash.
// Mirrors FlagConfigProvider. Empty config = the built-in BUS_TYPES defaults.
export default function BusTypeConfigProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/bus-type-config")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        applyBusTypeConfig(data?.config || {});
      })
      .catch(() => {
        applyBusTypeConfig({});
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
