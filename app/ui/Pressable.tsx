"use client";

import { forwardRef, type ReactNode } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components";
import styles from "./Pressable.module.css";
import { cx } from "./utils";

export interface PressableProps
  extends Omit<
    AriaButtonProps,
    "children" | "className" | "isDisabled"
  > {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isDisabled?: boolean;
}

/**
 * React Aria behavior without a visual preset.
 *
 * Use this for feature-specific rows, cards, and tiles whose appearance is
 * owned by a colocated CSS Module. Standard command buttons should use Button.
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  function Pressable(
    {
      children,
      className,
      disabled,
      isDisabled,
      ...props
    },
    ref,
  ) {
    return (
      <AriaButton
        ref={ref}
        {...props}
        className={cx(styles.pressable, className)}
        isDisabled={isDisabled ?? disabled}
      >
        {children}
      </AriaButton>
    );
  },
);
