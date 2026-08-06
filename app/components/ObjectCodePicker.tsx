"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  Button as AriaButton,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";
import { OBJECT_CODES } from "../lib/objectCodes";
import { useOverlayPresence } from "../ui/useOverlayPresence";
import styles from "./ObjectCodePicker.module.css";

interface ObjectCodePickerProps {
  value: string[];
  onChange: (codes: string[]) => void;
}

function descriptionFor(code: string): string {
  return OBJECT_CODES.find((item) => item.code === code)?.description || "";
}

export default function ObjectCodePicker({
  value,
  onChange,
}: ObjectCodePickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  useOverlayPresence(isOpen);
  const selected = useMemo(() => new Set(value), [value]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = normalized
      ? OBJECT_CODES.filter(
          (item) =>
            item.code.toLowerCase().includes(normalized) ||
            item.description.toLowerCase().includes(normalized),
        )
      : OBJECT_CODES;
    return list.slice(0, 100);
  }, [query]);

  function toggle(code: string) {
    if (selected.has(code)) {
      onChange(value.filter((item) => item !== code));
    } else {
      onChange([...value, code]);
    }
  }

  return (
    <div className={styles.picker}>
      {value.length > 0 && (
        <div className={styles.chips}>
          {value.map((code) => (
            <AriaButton
              className={styles.chip}
              key={code}
              onPress={() => toggle(code)}
              aria-label={`Remove ${code}`}
            >
              <span className={styles.chipCopy}>
                <strong>{descriptionFor(code) || code}</strong>
                {descriptionFor(code) && <small>Object code {code}</small>}
              </span>
              <X aria-hidden="true" />
            </AriaButton>
          ))}
        </div>
      )}

      <ComboBox
        className={styles.combo}
        inputValue={query}
        onInputChange={setQuery}
        selectedKey={null}
        items={matches}
        menuTrigger="focus"
        onOpenChange={setIsOpen}
        onSelectionChange={(key) => {
          if (key != null) toggle(String(key));
          setQuery("");
        }}
      >
        <Label className={styles.label}>Add object codes</Label>
        <div className={styles.control}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <Input
            className={styles.input}
            placeholder="Search code or description"
          />
          <AriaButton className={styles.trigger} aria-label="Show object codes">
            <ChevronDown aria-hidden="true" />
          </AriaButton>
        </div>
        <Popover className={styles.popover}>
          <ListBox className={styles.list}>
            {(item: (typeof OBJECT_CODES)[number]) => (
              <ListBoxItem
                id={item.code}
                textValue={`${item.code} ${item.description}`}
                className={styles.option}
              >
                <span className={styles.check} aria-hidden="true">
                  {selected.has(item.code) && <Check />}
                </span>
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
    </div>
  );
}
