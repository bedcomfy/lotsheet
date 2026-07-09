"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { applyFlagConfig } from "../lib/grid";

export default function FlagConfigProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/flag-config")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        applyFlagConfig(data?.config || {});
      })
      .catch(() => {
        applyFlagConfig({});
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
