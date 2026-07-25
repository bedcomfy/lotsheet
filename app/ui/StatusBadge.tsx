import type { ReactNode } from "react";
import styles from "./StatusBadge.module.css";
import { cx } from "./utils";

export type StatusTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface StatusBadgeProps {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  tone?: StatusTone;
  size?: "sm" | "md";
}

export function StatusBadge({
  children,
  className,
  icon,
  tone = "neutral",
  size = "md",
}: StatusBadgeProps) {
  return (
    <span
      className={cx(styles.badge, styles[tone], styles[size], className)}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.label}>{children}</span>
    </span>
  );
}
