"use client";

import * as Dialog from "@radix-ui/react-dialog";
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
export default function Overlay({ onClose, contentClassName, overlayClassName, label = "Dialog", children }: OverlayProps) {
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        {overlayClassName && <Dialog.Overlay className={overlayClassName} />}
        <Dialog.Content
          className={contentClassName}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
