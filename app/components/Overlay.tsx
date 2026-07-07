"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

const OVERLAY_CLOSE_EVENT = "pace-overlay-close";

export function closeOverlayFromEvent(e: ReactMouseEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT, { bubbles: true }));
}

interface OverlayProps {
  onClose: () => void;
  // Classes for the dialog box itself (e.g. "modal modal--tall" or "manager").
  contentClassName: string;
  // Dim backdrop classes. Omit for full-screen panels that cover the screen
  // themselves and don't need a separate dim layer.
  overlayClassName?: string;
  // Accessible name for screen readers (visually hidden).
  label?: string;
  // Focus a specific element during the open cycle (still within the user's
  // tap, so iOS brings the keyboard up). Use focus({ preventScroll: true })
  // inside to keep the no-jump guarantee.
  onOpenFocus?: () => void;
  children: ReactNode;
}

// Shared overlay built on Radix Dialog: robust, iOS-safe scroll-lock (the page
// behind can't scroll or bleed through), a focus trap, Escape-to-close, and
// click-outside-to-close.
//
// onOpenAutoFocus is prevented so opening a dialog never yanks the page — the
// editors that want an input focused do it themselves with { preventScroll: true }.
// onCloseAutoFocus is prevented too: Radix otherwise returns focus to the button
// that opened the dialog and the browser scrolls it into view — the "page jumps
// after editing a box" bug.
export default function Overlay({ onClose, contentClassName, overlayClassName, label = "Dialog", onOpenFocus, children }: OverlayProps) {
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(onClose, 340);
  }

  function isCloseButton(button: HTMLElement) {
    const text = (button.textContent || "").trim();
    return (
      button.classList.contains("modal__close") ||
      button.getAttribute("aria-label") === "Close" ||
      text === "Done"
    );
  }

  function interceptReactCloseClick(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const button = target.closest("button");
    if (!button || !e.currentTarget.contains(button) || !isCloseButton(button)) return;
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    requestClose();
  }

  // Pin the page's scroll position across the dialog's lifetime. Focus
  // prevention alone doesn't stop every jump — iOS in particular shifts the
  // underlying document when the on-screen keyboard opens/closes — so we
  // remember exactly where the user was and put them back there on close
  // (again after the keyboard finishes collapsing).
  useEffect(() => {
    const x = window.scrollX;
    const y = window.scrollY;
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      const restore = () => window.scrollTo(x, y);
      requestAnimationFrame(restore);
      setTimeout(restore, 60); // after the scroll-lock is released
      setTimeout(restore, 300); // after the mobile keyboard finishes closing
    };
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const contentEl = el;
    function interceptNativeClick(e: globalThis.MouseEvent) {
      const target = e.target as HTMLElement;
      const button = target.closest("button");
      if (!button || !contentEl.contains(button) || !isCloseButton(button)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      requestClose();
    }
    function closeFromChildEvent(e: Event) {
      e.preventDefault();
      e.stopPropagation();
      requestClose();
    }
    contentEl.addEventListener("click", interceptNativeClick, true);
    contentEl.addEventListener(OVERLAY_CLOSE_EVENT, closeFromChildEvent);
    return () => {
      contentEl.removeEventListener("click", interceptNativeClick, true);
      contentEl.removeEventListener(OVERLAY_CLOSE_EVENT, closeFromChildEvent);
    };
  });

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) requestClose(); }}>
      <Dialog.Portal forceMount>
        {overlayClassName && <Dialog.Overlay forceMount className={`${overlayClassName}${closing ? " is-closing" : ""}`} />}
        <Dialog.Content
          forceMount
          ref={contentRef}
          className={`${contentClassName}${closing ? " is-closing" : ""}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault(); // never let Radix's default focus scroll the page
            onOpenFocus?.();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownCapture={interceptReactCloseClick}
          onClickCapture={interceptReactCloseClick}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
