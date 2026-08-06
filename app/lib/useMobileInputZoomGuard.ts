"use client";

import { useEffect } from "react";

const TEXT_INPUT_TYPES = new Set([
  "",
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);

function isTextEntryTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  const field = target.closest<HTMLElement>("input, textarea, [contenteditable='true']");
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(field.type.toLowerCase());
  }
  return true;
}

function needsZoomGuard(target: EventTarget | null): boolean {
  if (window.innerWidth >= 700 || !isTextEntryTarget(target)) return false;
  const field = target.closest<HTMLElement>("input, textarea, [contenteditable='true']");
  if (!field) return false;
  return Number.parseFloat(window.getComputedStyle(field).fontSize) < 16;
}

function withMaximumScaleOne(content: string): string {
  const parts = content
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^maximum-scale\s*=/i.test(part));
  parts.push("maximum-scale=1");
  return parts.join(", ");
}

// Printable paper fields intentionally retain their small desktop typography on
// phones. iOS otherwise zooms the entire page when one receives focus. Locking
// the viewport only while that field is active prevents the jump without
// changing the sheet's geometry; the original viewport policy is restored as
// soon as editing ends.
export function useMobileInputZoomGuard(): void {
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport) return;

    const original = viewport.content;
    let locked = false;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const lock = (target: EventTarget | null) => {
      if (!needsZoomGuard(target)) return;
      if (restoreTimer) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      if (!locked) viewport.content = withMaximumScaleOne(original);
      locked = true;
    };

    const restore = () => {
      if (!locked) return;
      viewport.content = original;
      locked = false;
    };

    const queueRestore = () => {
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        if (!needsZoomGuard(document.activeElement)) restore();
        restoreTimer = null;
      }, 180);
    };

    const onPointerDown = (event: PointerEvent) => lock(event.target);
    const onFocusIn = (event: FocusEvent) => lock(event.target);

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", queueRestore, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", queueRestore, true);
      if (restoreTimer) clearTimeout(restoreTimer);
      restore();
    };
  }, []);
}
