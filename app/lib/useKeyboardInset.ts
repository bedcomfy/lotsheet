"use client";

// Tracks the live VisualViewport and publishes it as CSS variables on <html>.
// Phone overlays use the visible rectangle itself, so browser chrome and the
// keyboard cannot cover their headers, scroll body, or action row.
// Ported from the /m experiment: the one piece of it the sheet pages need.
//
// iOS Safari overlays the keyboard on the layout viewport without resizing
// it, so visualViewport is the only reliable signal. Desktop is untouched:
// tracking only engages under the phone breakpoint, and --mkb stays 0 there.

import { useEffect } from "react";

export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const phone = window.innerWidth < 700;
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      const top = vv?.offsetTop ?? 0;
      const left = vv?.offsetLeft ?? 0;
      const kb = phone
        ? Math.max(0, Math.round(window.innerHeight - height - top))
        : 0;
      const root = document.documentElement;
      root.style.setProperty("--ui-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--ui-viewport-width", `${Math.round(width)}px`);
      root.style.setProperty("--ui-viewport-top", `${Math.round(top)}px`);
      root.style.setProperty("--ui-viewport-left", `${Math.round(left)}px`);
      root.style.setProperty("--ui-keyboard-inset", `${kb}px`);
      document.documentElement.style.setProperty("--mkb", `${kb}px`);
      root.toggleAttribute("data-ui-keyboard-open", kb > 80);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.documentElement.style.setProperty("--mkb", "0px");
      document.documentElement.style.setProperty("--ui-keyboard-inset", "0px");
      document.documentElement.removeAttribute("data-ui-keyboard-open");
    };
  }, []);
}
