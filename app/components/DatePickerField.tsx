"use client";

import { dateValueToIso, isoToDisplayDate } from "../lib/dateField";

interface DatePickerFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  shortYear?: boolean;
  ariaLabel?: string;
  title?: string;
}

export default function DatePickerField({
  value,
  onValueChange,
  className = "",
  shortYear = false,
  ariaLabel = "Choose date",
  title,
}: DatePickerFieldProps) {
  return (
    <input
      type="date"
      className={`date-picker ${className}`.trim()}
      value={dateValueToIso(value)}
      onChange={(event) => onValueChange(isoToDisplayDate(event.target.value, shortYear))}
      aria-label={ariaLabel}
      title={title || ariaLabel}
    />
  );
}
