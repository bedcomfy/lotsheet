"use client";

import { dateValueToIso, isoToDisplayDate } from "../lib/dateField";
import styles from "./DatePickerField.module.css";

interface DatePickerFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  shortYear?: boolean;
  ariaLabel?: string;
  title?: string;
  variant?: "paper" | "ui";
}

export default function DatePickerField({
  value,
  onValueChange,
  className = "",
  shortYear = false,
  ariaLabel = "Choose date",
  title,
  variant = "paper",
}: DatePickerFieldProps) {
  return (
    <input
      type="date"
      className={`${variant === "ui" ? styles.input : "date-picker"} ${className}`.trim()}
      value={dateValueToIso(value)}
      onChange={(event) => onValueChange(isoToDisplayDate(event.target.value, shortYear))}
      aria-label={ariaLabel}
      title={title || ariaLabel}
    />
  );
}
