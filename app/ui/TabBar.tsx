"use client";

import {
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";
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
  const selectedKeys =
    selectedKey === undefined ? undefined : new Set<Key>([selectedKey]);
  const defaultSelectedKeys =
    defaultSelectedKey === undefined
      ? undefined
      : new Set<Key>([defaultSelectedKey]);

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
      <div className={styles.list}>
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
