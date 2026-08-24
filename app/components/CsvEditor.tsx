"use client";

import { useMemo, useState } from "react";
import { csvToMaster, masterToCsv } from "../lib/buses";
import {
  Button,
  ResponsiveDialog,
  StatusBadge,
  TextAreaField,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import styles from "./CsvEditor.module.css";

interface CsvEditorProps {
  onClose: () => void;
  onSaved?: () => void;
}

export default function CsvEditor({ onClose, onSaved }: CsvEditorProps) {
  const { master, setMaster } = useBusMaster();
  const [text, setText] = useState(() => masterToCsv(master.buses));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo<number | null>(() => {
    try {
      return csvToMaster(text).buses.length;
    } catch {
      return null;
    }
  }, [text]);

  async function save(close: () => void) {
    const parsed = csvToMaster(text);
    if (!parsed.buses.length) {
      setError(
        "No buses could be read. Check the header row and include a Bus Number column.",
      );
      return;
    }

    const nameByNum: Record<string, string> = {};
    for (const bus of master.buses) {
      if (bus.name) nameByNum[bus.num] = bus.name;
    }
    const buses = parsed.buses.map((bus) =>
      nameByNum[bus.num] ? { ...bus, name: nameByNum[bus.num] } : bus,
    );

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/buses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master: { buses } }),
      });
      const data = await response.json().catch(() => ({}));
      if (data?.master) {
        setMaster(data.master);
        close();
        if (onSaved) {
          window.setTimeout(onSaved, 190);
        }
      } else {
        setError("Save failed. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Edit full list (CSV)"
      description="Columns: Bus Number, Bus Length, Bus Model, Model Tag, Wrap, Status, Fuel/DEF, Hybrid Service Log."
      size="lg"
      bodyClassName={styles.body}
      footer={(close) => (
        <>
          <StatusBadge tone={preview != null ? "neutral" : "danger"}>
            {preview != null ? `${preview} buses` : "Can't read CSV"}
          </StatusBadge>
          <span className={styles.spacer} />
          <Button variant="quiet" onPress={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isDisabled={saving}
            onPress={() => save(close)}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </>
      )}
    >
      <TextAreaField
        label="Fleet CSV"
        labelHidden
        className={styles.area}
        spellCheck="false"
        value={text}
        onChange={(value) => {
          setText(value);
          setError("");
        }}
        rows={16}
      />
      {error && <div className={styles.error}>{error}</div>}
    </ResponsiveDialog>
  );
}
