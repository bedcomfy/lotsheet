"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useViewportVars } from "../lib/useViewportVars";

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
// click-outside-to-close — replacing the hand-rolled modal + useScrollLock.
export default function Overlay({ onClose, contentClassName, overlayClassName, label = "Dialog", children }: OverlayProps) {
  useViewportVars();
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        {overlayClassName && <Dialog.Overlay className={overlayClassName} />}
        <Dialog.Content className={contentClassName} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
