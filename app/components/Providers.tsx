"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
