"use client";

import { useEffect } from "react";

// Used by every full-screen overlay / modal. Two jobs:
//
// 1. Lock the page behind it so it can't scroll under the overlay.
//    - Desktop (fine pointer): `overflow:hidden` on <html>. This keeps the
//      page exactly where it is (no position change, so no "shoot up"), and we
//      reserve the scrollbar width as padding so nothing shifts sideways.
//    - Touch (iOS/Android): `position:fixed` on <body> with a saved scroll
//      offset — overflow:hidden alone doesn't stop touch scrolling / the
//      focus-scroll that yanks the page on mobile.
//
// 2. Track the visual viewport and publish --vvh / --vvtop / --kb so overlays
//    can sit above the on-screen keyboard.
export function useScrollLock() {
  useEffect(() => {
    const { body } = document;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const scrollbarW = Math.max(0, window.innerWidth - root.clientWidth);
    const isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

    const prevBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const prevRoot = {
      overflow: root.style.overflow,
      paddingRight: root.style.paddingRight,
    };

    if (isTouch) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;
    } else {
      // Desktop: just stop scrolling — the page stays put.
      root.style.overflow = "hidden";
      if (scrollbarW > 0) root.style.paddingRight = `${scrollbarW}px`;
    }

    const vv = window.visualViewport;
    const applyVV = () => {
      if (!vv) return;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvtop", `${vv.offsetTop}px`);
      root.style.setProperty("--kb", `${kb}px`);
    };
    applyVV();
    if (vv) {
      vv.addEventListener("resize", applyVV);
      vv.addEventListener("scroll", applyVV);
    }

    return () => {
      if (isTouch) {
        body.style.position = prevBody.position;
        body.style.top = prevBody.top;
        body.style.left = prevBody.left;
        body.style.right = prevBody.right;
        body.style.width = prevBody.width;
        body.style.overflow = prevBody.overflow;
        body.style.paddingRight = prevBody.paddingRight;
        window.scrollTo(0, scrollY);
      } else {
        root.style.overflow = prevRoot.overflow;
        root.style.paddingRight = prevRoot.paddingRight;
      }
      if (vv) {
        vv.removeEventListener("resize", applyVV);
        vv.removeEventListener("scroll", applyVV);
      }
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
      root.style.removeProperty("--kb");
    };
  }, []);
}
