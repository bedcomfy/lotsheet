"use client";

import { useMemo, useState } from "react";
import { masterToCsv, csvToMaster } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";

interface CsvEditorProps {
  onClose: () => void;
  onSaved?: () => void;
}

// Bulk editor for the whole fleet as CSV text — for the rare big changes (new
// models, type/length corrections, many buses at once). The simple Bus Lists
// menu covers day-to-day (active/retired, fuel/def).
export default function CsvEditor({ onClose, onSaved }: CsvEditorProps) {
  const { master, setMaster } = useBusMaster();
  const [text, setText] = useState(() => masterToCsv(master.buses));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const preview = useMemo<number | null>(() => {
    try {
      return csvToMaster(text).buses.length;
    } catch {
      return null;
    }
  }, [text]);

  async function save() {
    const parsed = csvToMaster(text);
    if (!parsed.buses.length) {
      setErr("Couldn't read any buses — check the header row and that there's at least a Bus Number column.");
      return;
    }
    // Preserve named vehicles (e.g. JUDI) — the CSV has no name column.
    const nameByNum: Record<string, string> = {};
    for (const b of master.buses) if (b.name) nameByNum[b.num] = b.name;
    const buses = parsed.buses.map((b) => (nameByNum[b.num] ? { ...b, name: nameByNum[b.num] } : b));

    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/buses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master: { buses } }),
      });
      const d = await res.json().catch(() => ({}));
      if (d && d.master) {
        setMaster(d.master);
        (onSaved || onClose)();
      } else {
        setErr("Save failed. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal modal--wide modal--tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <div className="modal__title">Edit full list (CSV)</div>
            <div className="modal__sub">
              Columns: Bus Number, Bus Length, Bus Model, Bus Type, Status, Fuel/DEF. Edit or paste, then Save.
            </div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <textarea
          className="csv__area"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr("");
          }}
        />

        {err && <div className="pwgate__err">{err}</div>}

        <div className="modal__actions">
          <span className="buslist__hint">{preview != null ? `${preview} buses` : "Can't read CSV"}</span>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
