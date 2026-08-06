"use client";

import { X } from "lucide-react";
import {
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import type { ReactNode } from "react";
import { IconButton } from "./Button";
import { useOverlayPresence } from "./useOverlayPresence";
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
  useOverlayPresence(isOpen);
  const close = () => onOpenChange(false);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className={styles.overlay}
    >
      <Modal
        className={styles.modal}
        data-size={size}
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
          <div
            className={`${styles.body} ${bodyClassName ?? ""}`.trim()}
            data-dialog-body=""
          >
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
