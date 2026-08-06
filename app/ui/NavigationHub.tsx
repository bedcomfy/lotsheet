"use client";

import { ArrowRight, X } from "lucide-react";
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import type { ReactNode } from "react";
import { IconButton } from "./Button";
import { useOverlayPresence } from "./useOverlayPresence";
import styles from "./NavigationHub.module.css";

export interface NavigationHubItem {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
}

export interface NavigationHubProps {
  description?: ReactNode;
  footer?: ReactNode;
  isOpen: boolean;
  items: NavigationHubItem[];
  onAction: (id: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
}

export function NavigationHub({
  description,
  footer,
  isOpen,
  items,
  onAction,
  onOpenChange,
  title,
}: NavigationHubProps) {
  useOverlayPresence(isOpen);
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={styles.overlay}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className={styles.eyebrow}>Pace Northwest</span>
              <Heading slot="title" className={styles.title}>
                {title}
              </Heading>
              {description && (
                <p className={styles.description}>{description}</p>
              )}
            </div>
            <IconButton
              aria-label={`Close ${title}`}
              variant="quiet"
              onPress={() => onOpenChange(false)}
            >
              <X aria-hidden="true" />
            </IconButton>
          </header>

          <div className={styles.body}>
            <div className={styles.list}>
              {items.map((item) => (
                <AriaButton
                  key={item.id}
                  className={styles.item}
                  onPress={() => onAction(item.id)}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className={styles.copy}>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <ArrowRight className={styles.arrow} aria-hidden="true" />
                </AriaButton>
              ))}
            </div>
          </div>

          {footer && <footer className={styles.footer}>{footer}</footer>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
