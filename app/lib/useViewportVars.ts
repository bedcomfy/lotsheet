"use client";

import { useEffect } from "react";

// Publishes the visual-viewport metrics as CSS variables on :root so overlays
// can sit above the on-screen keyboard:
//   --vvh   visible viewport height (caps a modal so it scrolls within view)
//   --vvtop offset from the top (full-screen panels pad by this)
//   --kb    keyboard height (bottom sheets lift by this on iOS)
//
// Scroll-locking the page behind an overlay is handled by Radix Dialog
// (react-remove-scroll) — this hook only tracks the viewport.
export function useViewportVars() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const apply = () => {
      if (!vv) return;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvtop", `${vv.offsetTop}px`);
      root.style.setProperty("--kb", `${kb}px`);
    };
    apply();
    if (vv) {
      vv.addEventListener("resize", apply);
      vv.addEventListener("scroll", apply);
    }
    return () => {
      if (vv) {
        vv.removeEventListener("resize", apply);
        vv.removeEventListener("scroll", apply);
      }
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
      root.style.removeProperty("--kb");
    };
  }, []);
}
