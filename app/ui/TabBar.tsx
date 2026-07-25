"use client";

import {
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Key } from "react-aria-components";
import styles from "./TabBar.module.css";
import { cx } from "./utils";

export interface TabOption {
  id: Key;
  label: ReactNode;
  icon?: ReactNode;
  isDisabled?: boolean;
}

export interface TabBarProps {
  label: string;
  items: TabOption[];
  className?: string;
  selectedKey?: Key;
  defaultSelectedKey?: Key;
  onSelectionChange?: (key: Key) => void;
  isDisabled?: boolean;
}

export function TabBar({
  label,
  items,
  className,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  isDisabled,
}: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedKeys =
    selectedKey === undefined ? undefined : new Set<Key>([selectedKey]);
  const defaultSelectedKeys =
    defaultSelectedKey === undefined
      ? undefined
      : new Set<Key>([defaultSelectedKey]);

  useEffect(() => {
    if (selectedKey === undefined) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const list = listRef.current;
        const selected = list?.querySelector<HTMLElement>("[data-selected]");
        if (!list || !selected) return;

        const centeredLeft =
          selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2;
        list.scrollTo({
          left: Math.max(0, centeredLeft),
          behavior: "auto",
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [selectedKey]);

  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={selectedKeys}
      defaultSelectedKeys={defaultSelectedKeys}
      isDisabled={isDisabled}
      onSelectionChange={(keys) => {
        const key = [...keys][0];
        if (key !== undefined) onSelectionChange?.(key);
      }}
      className={cx(styles.tabs, className)}
    >
      <div ref={listRef} className={styles.list}>
        {items.map((item) => (
          <ToggleButton
            key={String(item.id)}
            id={item.id}
            isDisabled={item.isDisabled}
            className={styles.tab}
          >
            {item.icon && (
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </ToggleButton>
        ))}
      </div>
    </ToggleButtonGroup>
  );
}
