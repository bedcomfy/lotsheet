"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect } from "react";
import type { ReactNode } from "react";

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
  // Pin the page's scroll position across the dialog's lifetime. Focus
  // prevention alone doesn't stop every jump — iOS in particular shifts the
  // underlying document when the on-screen keyboard opens/closes — so we
  // remember exactly where the user was and put them back there on close
  // (again after the keyboard finishes collapsing).
  useEffect(() => {
    const x = window.scrollX;
    const y = window.scrollY;
    return () => {
      const restore = () => window.scrollTo(x, y);
      requestAnimationFrame(restore);
      setTimeout(restore, 60); // after the scroll-lock is released
      setTimeout(restore, 300); // after the mobile keyboard finishes closing
    };
  }, []);
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        {overlayClassName && <Dialog.Overlay className={overlayClassName} />}
        <Dialog.Content
          className={contentClassName}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault(); // never let Radix's default focus scroll the page
            onOpenFocus?.();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
