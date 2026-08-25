"use client";

import { Search, X } from "lucide-react";
import {
  Button as AriaButton,
  FieldError,
  Input,
  Label,
  SearchField as AriaSearchField,
  Text,
  TextArea,
  TextField as AriaTextField,
} from "react-aria-components";
import type {
  SearchFieldProps as AriaSearchFieldProps,
  TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import type { HTMLInputTypeAttribute, ReactNode, Ref } from "react";
import styles from "./Field.module.css";
import { cx } from "./utils";

interface FieldCopyProps {
  label: ReactNode;
  labelHidden?: boolean;
  description?: ReactNode;
  errorMessage?: ReactNode;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export interface TextFieldProps
  extends Omit<AriaTextFieldProps, "children" | "className">,
    FieldCopyProps {
  className?: string;
  inputType?: HTMLInputTypeAttribute;
}

export function TextField({
  label,
  labelHidden = false,
  description,
  errorMessage,
  placeholder,
  inputRef,
  className,
  inputType = "text",
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className={cx(styles.field, className)}>
      <Label className={cx(styles.label, labelHidden && styles.visuallyHidden)}>
        {label}
      </Label>
      <div className={styles.control}>
        <Input
          ref={inputRef}
          className={styles.input}
          placeholder={placeholder}
          type={inputType}
        />
      </div>
      {description && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}

export interface SearchFieldProps
  extends Omit<AriaSearchFieldProps, "children" | "className">,
    FieldCopyProps {
  className?: string;
}

export function SearchField({
  label,
  labelHidden = false,
  description,
  errorMessage,
  placeholder,
  inputRef,
  className,
  ...props
}: SearchFieldProps) {
  return (
    <AriaSearchField
      {...props}
      className={cx(styles.field, styles.searchField, className)}
    >
      <Label className={cx(styles.label, labelHidden && styles.visuallyHidden)}>
        {label}
      </Label>
      <div className={styles.control}>
        <Search aria-hidden="true" className={styles.searchIcon} />
        <Input ref={inputRef} className={styles.input} placeholder={placeholder} />
        <AriaButton className={styles.clearButton} aria-label="Clear search">
          <X aria-hidden="true" />
        </AriaButton>
      </div>
      {description && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaSearchField>
  );
}

export interface TextAreaFieldProps
  extends Omit<AriaTextFieldProps, "children" | "className">,
    Omit<FieldCopyProps, "inputRef"> {
  className?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  rows?: number;
}

export function TextAreaField({
  label,
  labelHidden = false,
  description,
  errorMessage,
  placeholder,
  inputRef,
  rows = 6,
  className,
  ...props
}: TextAreaFieldProps) {
  return (
    <AriaTextField
      {...props}
      className={cx(styles.field, styles.textAreaField, className)}
    >
      <Label className={cx(styles.label, labelHidden && styles.visuallyHidden)}>
        {label}
      </Label>
      <TextArea
        ref={inputRef}
        rows={rows}
        className={styles.textArea}
        placeholder={placeholder}
      />
      {description && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
