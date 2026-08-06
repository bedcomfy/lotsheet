"use client";

import { useEffect, useRef } from "react";

const activeOverlays = new Set<symbol>();
const EXIT_GRACE_MS = 240;

function syncOverlayAttribute() {
  if (typeof document === "undefined") return;
  if (activeOverlays.size) document.documentElement.setAttribute("data-ui-overlay-open", "");
  else document.documentElement.removeAttribute("data-ui-overlay-open");
}

// Shared overlays call this once so app chrome can yield while a dialog, menu,
// or navigation hub owns the viewport. A set handles nested transitions and
// React strict-mode mounts without an error-prone global counter.
export function useOverlayPresence(isOpen: boolean): void {
  const id = useRef(Symbol("ui-overlay"));
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = id.current;
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }

    if (isOpen) {
      activeOverlays.add(token);
      syncOverlayAttribute();
      return;
    }

    // React Aria keeps exiting overlays mounted briefly for their CSS animation.
    // Keep mobile navigation out of the way until that transition is complete.
    releaseTimer.current = setTimeout(() => {
      activeOverlays.delete(token);
      syncOverlayAttribute();
      releaseTimer.current = null;
    }, EXIT_GRACE_MS);
  }, [isOpen]);

  useEffect(() => {
    const token = id.current;
    return () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(() => {
        activeOverlays.delete(token);
        syncOverlayAttribute();
      }, EXIT_GRACE_MS);
    };
  }, []);
}
