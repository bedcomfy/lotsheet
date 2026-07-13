"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Drives the /api/live long-poll and refreshes the TanStack Query cache whenever
// the server's change token advances — so shared data (sheet, flags, employees,
// work pick…) updates within ~1s of any write on any device, instead of waiting
// for each query's fallback interval.
export function useLiveSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let active = true;
    let since = 0;

    async function loop() {
      while (active) {
        try {
          const res = await fetch(`/api/live?since=${since}`, { cache: "no-store" });
          if (!active) break;
          const data = (await res.json()) as { pulse?: number; changed?: boolean };
          const pulse = typeof data.pulse === "number" ? data.pulse : since;
          if (pulse > since) {
            since = pulse;
            // Something changed — let active queries refetch their latest.
            qc.invalidateQueries();
          } else {
            since = pulse; // timed out with no change; keep waiting
          }
        } catch {
          if (!active) break;
          await new Promise((r) => setTimeout(r, 3000)); // back off on error
        }
      }
    }

    loop();
    return () => {
      active = false;
    };
  }, [qc]);
}
