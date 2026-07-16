"use client";

// Tracks the on-screen keyboard via the VisualViewport API and publishes its
// height as a CSS variable (--mkb) on <html>. Anything that must stay visible
// above the keyboard (the Walk's dock, the Bus Card) positions itself with
// bottom: var(--mkb). iOS Safari overlays the keyboard on the layout viewport
// without resizing it — visualViewport is the only reliable signal.

import { useEffect, useState } from "react";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(kb);
      document.documentElement.style.setProperty("--mkb", `${kb}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.setProperty("--mkb", "0px");
    };
  }, []);

  return inset;
}
