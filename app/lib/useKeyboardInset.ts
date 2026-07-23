"use client";

// Tracks the on-screen keyboard via the VisualViewport API and publishes its
// height as a CSS variable (--mkb) on <html>. Phone dialogs subtract it from
// their height so inputs and action rows always stay ABOVE the keyboard.
// (Ported from the /m experiment — the one piece of it the sheet pages need.)
//
// iOS Safari overlays the keyboard on the layout viewport without resizing
// it, so visualViewport is the only reliable signal. Desktop is untouched:
// tracking only engages under the phone breakpoint, and --mkb stays 0 there.

import { useEffect } from "react";

export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const phone = window.innerWidth < 700;
      const kb = phone
        ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        : 0;
      document.documentElement.style.setProperty("--mkb", `${kb}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.setProperty("--mkb", "0px");
    };
  }, []);
}
