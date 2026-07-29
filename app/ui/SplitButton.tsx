"use client";

// Split button: a primary action plus a chevron opening related variants —
// e.g. Print PDF | ▾ Print blank / lane copies. Saves the trip through a
// "More" menu for the second-most-common action.

import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Text,
} from "react-aria-components";
import { ChevronDown } from "lucide-react";
import type { Key, ReactNode } from "react";
import { Button, IconButton } from "./Button";
import type { ButtonProps } from "./Button";
import type { ActionMenuItem } from "./ActionMenu";
import menuStyles from "./ActionMenu.module.css";
import styles from "./SplitButton.module.css";
import { cx } from "./utils";

export interface SplitButtonProps {
  children: ReactNode;
  onPress: () => void;
  items: ActionMenuItem[];
  onAction: (key: Key) => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  menuLabel?: string;
  className?: string;
  isDisabled?: boolean;
}

export function SplitButton({
  children,
  onPress,
  items,
  onAction,
  variant = "primary",
  size = "md",
  menuLabel = "More options",
  className,
  isDisabled,
}: SplitButtonProps) {
  return (
    <div className={cx(styles.group, className)} data-variant={variant}>
      <Button
        variant={variant}
        size={size}
        onPress={onPress}
        isDisabled={isDisabled}
        className={styles.main}
      >
        {children}
      </Button>
      <MenuTrigger>
        <IconButton
          variant={variant}
          size={size}
          aria-label={menuLabel}
          isDisabled={isDisabled}
          className={styles.chevron}
        >
          <ChevronDown />
        </IconButton>
        <Popover placement="bottom end" className={menuStyles.popover}>
          <Menu aria-label={menuLabel} items={items} onAction={onAction} className={menuStyles.menu}>
            {(item) => (
              <MenuItem
                id={item.id}
                textValue={item.label}
                isDisabled={item.isDisabled}
                data-tone={item.tone ?? "default"}
                className={menuStyles.item}
              >
                {item.icon && (
                  <span className={menuStyles.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <Text slot="label" className={menuStyles.label}>
                  {item.label}
                </Text>
                {item.description && (
                  <Text slot="description" className={menuStyles.description}>
                    {item.description}
                  </Text>
                )}
              </MenuItem>
            )}
          </Menu>
        </Popover>
      </MenuTrigger>
    </div>
  );
}
