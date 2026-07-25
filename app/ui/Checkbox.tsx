"use client";

import { Check, Minus } from "lucide-react";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import type { CheckboxProps as AriaCheckboxProps } from "react-aria-components";
import type { ReactNode } from "react";
import styles from "./Checkbox.module.css";
import { cx } from "./utils";

export interface CheckboxProps
  extends Omit<AriaCheckboxProps, "children" | "className"> {
  children: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function Checkbox({
  children,
  description,
  className,
  ...props
}: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className={cx(styles.checkbox, className)}>
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className={styles.box} aria-hidden="true">
            {isIndeterminate ? (
              <Minus />
            ) : isSelected ? (
              <Check />
            ) : null}
          </span>
          <span className={styles.copy}>
            <span className={styles.label}>{children}</span>
            {description && (
              <span className={styles.description}>{description}</span>
            )}
          </span>
        </>
      )}
    </AriaCheckbox>
  );
}
