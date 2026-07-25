"use client";

import { Button as AriaButton } from "react-aria-components";
import type { ReactNode } from "react";
import styles from "./MobileNavigationBar.module.css";
import { cx } from "./utils";

export interface MobileNavigationItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface MobileNavigationBarProps {
  activeId?: string | null;
  className?: string;
  items: MobileNavigationItem[];
  label?: string;
  onAction: (id: string) => void;
}

export function MobileNavigationBar({
  activeId,
  className,
  items,
  label = "Mobile navigation",
  onAction,
}: MobileNavigationBarProps) {
  return (
    <nav
      className={cx(styles.navigation, className)}
      aria-label={label}
    >
      {items.map((item) => (
        <AriaButton
          key={item.id}
          className={styles.item}
          data-active={item.id === activeId || undefined}
          aria-current={item.id === activeId ? "page" : undefined}
          onPress={() => onAction(item.id)}
        >
          <span className={styles.icon} aria-hidden="true">
            {item.icon}
          </span>
          <span className={styles.label}>{item.label}</span>
        </AriaButton>
      ))}
    </nav>
  );
}
