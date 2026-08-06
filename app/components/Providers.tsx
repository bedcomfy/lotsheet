"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLiveSync } from "../lib/useLiveSync";
import { useKeyboardInset } from "../lib/useKeyboardInset";
import { useMobileInputZoomGuard } from "../lib/useMobileInputZoomGuard";

// Runs the real-time long-poll; refreshes queries on any change. Rendered inside
// the provider so it has access to the query client. Also publishes the phone
// keyboard height as --mkb (0 on desktop) for keyboard-aware dialogs.
function LiveSync() {
  useLiveSync();
  useKeyboardInset();
  useMobileInputZoomGuard();
  return null;
}

// App-wide client providers. Hosts the TanStack Query cache so any component can
// read shared server state through a single deduplicated, cached source instead
// of its own fetch + setInterval + useState.
export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Internal tool: a little staleness is fine; each hook sets its own
            // refetchInterval for how "live" that slice needs to be.
            staleTime: 2000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <LiveSync />
      {children}
    </QueryClientProvider>
  );
}
