"use client";

import { useState, type ReactNode } from "react";
import { Button, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, Text, type ComboBoxProps, type Key } from "react-aria-components";
import { ChevronDown } from "lucide-react";
import { useOverlayPresence } from "./useOverlayPresence";
import styles from "./ComboBoxField.module.css";

export interface ComboBoxOption { id: Key; label: string; description?: string }
interface Props extends Omit<ComboBoxProps<ComboBoxOption>, "children" | "items" | "className"> {
  label: string; description?: ReactNode; options: ComboBoxOption[]; placeholder?: string; emptyMessage?: string;
}
/** Controlled items allow callers to search complete local indexes by multiple words. */
export function ComboBoxField({ label, description, options, placeholder, emptyMessage = "No matching results", onOpenChange, ...props }: Props) {
  const [open, setOpen] = useState(false);
  useOverlayPresence(open);
  return <ComboBox {...props} items={options} className={styles.field} allowsEmptyCollection
    onOpenChange={(value, trigger) => { setOpen(value); onOpenChange?.(value, trigger); }}>
    <Label className={styles.label}>{label}</Label>
    <div className={styles.control}>
      <Input className={styles.input} placeholder={placeholder} />
      <Button className={styles.trigger} aria-label="Show suggestions"><ChevronDown aria-hidden="true" /></Button>
    </div>
    {description && <Text slot="description" className={styles.description}>{description}</Text>}
    <Popover className={styles.popover}>
      <ListBox<ComboBoxOption> className={styles.list} renderEmptyState={() => <div className={styles.empty}>{emptyMessage}</div>}>
        {(option) => <ListBoxItem id={option.id} textValue={option.label} className={styles.option}>
          <Text slot="label" className={styles.optionLabel}>{option.label}</Text>
          {option.description && <Text slot="description" className={styles.optionDescription}>{option.description}</Text>}
        </ListBoxItem>}
      </ListBox>
    </Popover>
  </ComboBox>;
}
