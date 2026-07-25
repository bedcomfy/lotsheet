"use client";

import { ChevronDown, Check } from "lucide-react";
import {
  Button as AriaButton,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Text,
} from "react-aria-components";
import type { ReactNode } from "react";
import type { Key, SelectProps } from "react-aria-components";
import styles from "./SelectField.module.css";
import { cx } from "./utils";

export interface SelectOption {
  id: Key;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

export interface SelectFieldProps
  extends Omit<
    SelectProps<SelectOption>,
    "children" | "className" | "items"
  > {
  label: ReactNode;
  options: SelectOption[];
  description?: ReactNode;
  errorMessage?: ReactNode;
  className?: string;
}

export function SelectField({
  label,
  options,
  description,
  errorMessage,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <Select<SelectOption>
      {...props}
      className={cx(styles.field, className)}
    >
      <Label className={styles.label}>{label}</Label>
      <AriaButton className={styles.trigger}>
        <SelectValue className={styles.value} />
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </AriaButton>
      {description && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
      <Popover className={styles.popover}>
        <ListBox items={options} className={styles.list}>
          {(option) => (
            <ListBoxItem
              id={option.id}
              textValue={option.label}
              isDisabled={option.isDisabled}
              className={styles.option}
            >
              <span className={styles.optionCopy}>
                <span className={styles.optionLabel}>{option.label}</span>
                {option.description && (
                  <span className={styles.optionDescription}>
                    {option.description}
                  </span>
                )}
              </span>
              <Check className={styles.check} aria-hidden="true" />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
