"use client";

import { useEffect } from "react";

// Used by every full-screen overlay / modal. Two jobs:
//
// 1. Freeze the page behind it (position:fixed + saved scrollY) so the sheet
//    can't scroll under the overlay and bleed through on iOS, and so focusing
//    an input scrolls the overlay's own area, not the whole document.
//
// 2. Track the *visual* viewport and publish it as --vvh / --vvtop CSS vars.
//    On iOS a position:fixed element stays the full layout height even when the
//    keyboard is open, so a bottom-anchored sheet ends up hidden behind the
//    keyboard. Sizing overlays to the visual viewport keeps them in the area
//    that's actually visible above the keyboard.
export function useScrollLock() {
  useEffect(() => {
    const { body } = document;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const vv = window.visualViewport;
    const applyVV = () => {
      if (!vv) return;
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvtop", `${vv.offsetTop}px`);
    };
    applyVV();
    if (vv) {
      vv.addEventListener("resize", applyVV);
      vv.addEventListener("scroll", applyVV);
    }

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
      if (vv) {
        vv.removeEventListener("resize", applyVV);
        vv.removeEventListener("scroll", applyVV);
      }
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
    };
  }, []);
}
