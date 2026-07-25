"use client";

import { Button as AriaButton } from "react-aria-components";
import type { ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ReactNode } from "react";
import type { StatusTone } from "./StatusBadge";
import styles from "./MetricTile.module.css";
import { cx } from "./utils";

export interface MetricTileProps
  extends Omit<
    AriaButtonProps,
    "children" | "className" | "style" | "value"
  > {
  label: string;
  value: ReactNode;
  className?: string;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: StatusTone;
}

export function MetricTile({
  label,
  value,
  className,
  detail,
  icon,
  tone = "neutral",
  ...props
}: MetricTileProps) {
  return (
    <AriaButton
      {...props}
      className={cx(styles.tile, className)}
      data-tone={tone}
    >
      <span className={styles.topline}>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className={styles.value}>{value}</span>
      </span>
      <span className={styles.label}>{label}</span>
      {detail && <span className={styles.detail}>{detail}</span>}
    </AriaButton>
  );
}
