"use client";

// Screen-only helper above the Fuel/DEF and Farebox sheets: type the
// servicer's initials once and fill every row that has none, instead of
// retyping them 130 times. Never prints.

import { useState } from "react";
import { UserRoundCheck } from "lucide-react";
import { Button, TextField } from "../ui";
import styles from "./ServicerFillBar.module.css";

export interface ServicerFillBarProps {
  blankCount: number;
  onFill: (initials: string) => void;
  // An optional second one-tap action for the sheet (e.g. Farebox "Mark all Y").
  extra?: { label: string; hint: string; onPress: () => void };
}

export default function ServicerFillBar({ blankCount, onFill, extra }: ServicerFillBarProps) {
  const [initials, setInitials] = useState("");
  const ready = initials.trim().length > 0 && blankCount > 0;
  return (
    <div className={`${styles.bar} no-print`} role="group" aria-label="Fill every row at once">
      <UserRoundCheck aria-hidden="true" className={styles.icon} />
      <TextField
        className={styles.field}
        label="Servicer initials"
        labelHidden
        placeholder="Initials"
        value={initials}
        onChange={(value) => setInitials(value.toUpperCase().slice(0, 4))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && ready) {
            event.preventDefault();
            onFill(initials.trim());
          }
        }}
      />
      <Button size="sm" isDisabled={!ready} onPress={() => onFill(initials.trim())}>
        Fill {blankCount} blank SERV
      </Button>
      {extra && (
        <Button size="sm" variant="quiet" className={styles.extra} onPress={extra.onPress}>
          {extra.label} <span className={styles.hint}>· {extra.hint}</span>
        </Button>
      )}
    </div>
  );
}
