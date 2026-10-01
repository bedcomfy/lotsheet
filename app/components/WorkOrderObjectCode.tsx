"use client";

// The Object Code box on a work order operation line. Type the code or any
// words from its description and pick a match; the code lands in the box and
// the description is offered to the line (the sheet decides whether to keep
// a hand-typed one). Free text is allowed too, so an unlisted code still works.

import { useMemo, useState } from "react";
import { ComboBox, Input, ListBox, ListBoxItem, Popover, Text } from "react-aria-components";
import { OBJECT_CODES, type ObjectCode } from "../lib/objectCodes";
import { useOverlayPresence } from "../ui/useOverlayPresence";
import styles from "./ObjectCodePicker.module.css";

const MAX_MATCHES = 40;

export function matchObjectCodes(query: string): ObjectCode[] {
  const q = query.trim().toLowerCase();
  if (!q) return OBJECT_CODES.slice(0, MAX_MATCHES);
  const words = q.split(/\s+/).filter(Boolean);
  const byCode = OBJECT_CODES.filter((item) => item.code.startsWith(q));
  const byText = OBJECT_CODES.filter(
    (item) => !item.code.startsWith(q) && words.every((w) => item.description.toLowerCase().includes(w) || item.code.includes(w)),
  );
  return [...byCode, ...byText].slice(0, MAX_MATCHES);
}

export default function WorkOrderObjectCode({
  value,
  onChange,
  onPick,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  onPick: (item: ObjectCode) => void;
  ariaLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  useOverlayPresence(isOpen);
  const matches = useMemo(() => matchObjectCodes(value), [value]);
  return (
    <ComboBox
      aria-label={ariaLabel}
      className={styles.woCombo}
      inputValue={value}
      onInputChange={onChange}
      selectedKey={null}
      items={matches}
      allowsCustomValue
      allowsEmptyCollection
      menuTrigger="focus"
      onOpenChange={setIsOpen}
      onSelectionChange={(key) => {
        if (key == null) return;
        const item = OBJECT_CODES.find((o) => o.code === String(key));
        if (item) onPick(item);
      }}
    >
      <Input className="wo-in" />
      <Popover className={`${styles.popover} ${styles.woPopover}`} placement="bottom start">
        <ListBox className={styles.list}>
          {(item: ObjectCode) => (
            <ListBoxItem id={item.code} textValue={`${item.code} ${item.description}`} className={styles.option}>
              <span className={styles.check} aria-hidden="true" />
              <Text slot="label" className={styles.code}>
                {item.code}
              </Text>
              <Text slot="description" className={styles.description}>
                {item.description}
              </Text>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
