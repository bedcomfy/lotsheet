"use client";

import { Button as AriaButton } from "react-aria-components";
import type { ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ReactNode } from "react";
import type { StatusTone } from "./StatusBadge";
import styles from "./Chip.module.css";
import { cx } from "./utils";

interface ChipBaseProps {
  children: ReactNode;
  icon?: ReactNode;
  tone?: StatusTone;
  isSelected?: boolean;
  className?: string;
}

export interface ChipProps
  extends ChipBaseProps,
    Omit<AriaButtonProps, "children" | "className" | "style"> {}

export function Chip({
  children,
  icon,
  tone = "neutral",
  isSelected = false,
  className,
  ...props
}: ChipProps) {
  return (
    <AriaButton
      {...props}
      className={cx(styles.chip, className)}
      data-tone={tone}
      data-selected={isSelected || undefined}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </AriaButton>
  );
}

export function StaticChip({
  children,
  icon,
  tone = "neutral",
  className,
}: ChipBaseProps) {
  return (
    <span className={cx(styles.chip, styles.static, className)} data-tone={tone}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
