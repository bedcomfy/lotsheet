"use client";

import { useEffect } from "react";

// Freeze the page behind a full-screen overlay / modal while it's open. This
// (a) stops the sheet behind from scrolling and bleeding through on iOS, and
// (b) makes focusing an input scroll the overlay's own scroll area instead of
// yanking the whole document to the focused box. The exact scroll position is
// restored when the overlay closes.
export function useScrollLock() {
  useEffect(() => {
    const { body } = document;
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
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
