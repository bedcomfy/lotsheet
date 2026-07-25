"use client";

import { Button as AriaButton } from "react-aria-components";
import type { ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ReactNode } from "react";
import styles from "./Button.module.css";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<AriaButtonProps, "children" | "className" | "style"> {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  children,
  className,
  variant = "secondary",
  size = "md",
  fullWidth = false,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        className,
      )}
    >
      {children}
    </AriaButton>
  );
}

export interface IconButtonProps
  extends Omit<ButtonProps, "children" | "fullWidth"> {
  "aria-label": string;
  children: ReactNode;
}

export function IconButton({
  children,
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button {...props} className={cx(styles.iconOnly, className)}>
      {children}
    </Button>
  );
}
