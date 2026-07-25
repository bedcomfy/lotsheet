"use client";

import { X } from "lucide-react";
import {
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconButton } from "./Button";
import styles from "./ResponsiveDialog.module.css";

export interface ResponsiveDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode | ((close: () => void) => ReactNode);
  isDismissable?: boolean;
  size?: "sm" | "md" | "lg" | "full";
  bodyClassName?: string;
}

export function ResponsiveDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  isDismissable = true,
  size = "md",
  bodyClassName,
}: ResponsiveDialogProps) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) setIsClosing(false);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [isOpen]);

  const requestOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenChange(true);
        return;
      }
      if (isClosing) return;
      setIsClosing(true);
      closeTimer.current = setTimeout(() => onOpenChange(false), 180);
    },
    [isClosing, onOpenChange],
  );

  const close = useCallback(() => requestOpenChange(false), [requestOpenChange]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={requestOpenChange}
      isDismissable={isDismissable}
      className={styles.overlay}
      data-closing={isClosing || undefined}
    >
      <Modal
        className={styles.modal}
        data-size={size}
        data-closing={isClosing || undefined}
      >
        <Dialog className={styles.dialog}>
          <header className={styles.header}>
            <div className={styles.headingGroup}>
              <Heading slot="title" className={styles.title}>
                {title}
              </Heading>
              {description && (
                <p className={styles.description}>{description}</p>
              )}
            </div>
            <IconButton
              aria-label="Close"
              variant="quiet"
              onPress={close}
            >
              <X aria-hidden="true" />
            </IconButton>
          </header>
          <div className={`${styles.body} ${bodyClassName ?? ""}`.trim()}>
            {children}
          </div>
          {footer && (
            <footer className={styles.footer}>
              {typeof footer === "function" ? footer(close) : footer}
            </footer>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
