"use client";

import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Text,
} from "react-aria-components";
import type { Key, ReactNode } from "react";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import styles from "./ActionMenu.module.css";

export interface ActionMenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  isDisabled?: boolean;
}

export interface ActionMenuProps {
  label: ReactNode;
  items: ActionMenuItem[];
  onAction: (key: Key) => void;
  placement?: "bottom start" | "bottom end" | "top start" | "top end";
  buttonVariant?: ButtonProps["variant"];
  buttonSize?: ButtonProps["size"];
}

export function ActionMenu({
  label,
  items,
  onAction,
  placement = "bottom start",
  buttonVariant = "secondary",
  buttonSize = "md",
}: ActionMenuProps) {
  return (
    <MenuTrigger>
      <Button variant={buttonVariant} size={buttonSize}>
        {label}
      </Button>
      <Popover placement={placement} className={styles.popover}>
        <Menu
          aria-label="Actions"
          items={items}
          onAction={onAction}
          className={styles.menu}
        >
          {(item) => (
            <MenuItem
              id={item.id}
              textValue={item.label}
              isDisabled={item.isDisabled}
              data-tone={item.tone ?? "default"}
              className={styles.item}
            >
              {item.icon && (
                <span className={styles.icon} aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <Text slot="label" className={styles.label}>
                {item.label}
              </Text>
              {item.description && (
                <Text slot="description" className={styles.description}>
                  {item.description}
                </Text>
              )}
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
