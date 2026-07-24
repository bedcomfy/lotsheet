"use client";

import { useEffect, useState } from "react";
import Overlay from "./Overlay";
import type { HistoryEntry } from "../lib/store";
import { SkeletonRows } from "./Skeleton";

function savedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

interface SheetHistoryProps {
  apiBase: string;
  title?: string;
  describe?: (sheet: any) => { title: string; meta: string };
  onImport: (sheet: unknown, id: string) => void;
  onClose: () => void;
}

// Generic "Prev Sheets" browser. `apiBase` is the history endpoint
// (e.g. /api/state/fuel/history); `describe(sheet)` returns { title, meta }.
export default function SheetHistory({ apiBase, title = "Prev Sheets", describe, onImport, onClose }: SheetHistoryProps) {
  const [sheets, setSheets] = useState<HistoryEntry[] | null>(null); // null = loading
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => setSheets(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setSheets([]));
  }, [apiBase]);

  async function remove(id: string) {
    if (!window.confirm("Delete this saved sheet permanently?")) return;
    setBusy(id);
    try {
      const res = await fetch(`${apiBase}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (Array.isArray(d.sheets)) setSheets(d.sheets);
      else setSheets((cur) => (cur || []).filter((s) => s.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Overlay onClose={onClose} overlayClassName="modal-backdrop no-print" contentClassName="modal modal--tall" label={title}>
        <div className="modal__head">
          <div>
            <div className="modal__title">{title}</div>
            <div className="modal__sub">
              The last 20 are kept. Import one to continue it, or delete it.
            </div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="lotlist">
          {sheets === null && <SkeletonRows rows={4} />}
          {sheets !== null && sheets.length === 0 && (
            <div className="lotlist__empty">
              No saved sheets yet. When you clear the sheet, the old one is kept here.
            </div>
          )}
          {(sheets || []).map((s) => {
            const d = describe ? describe(s.sheet) : { title: "—", meta: "" };
            return (
              <div className="prevsheet" key={s.id}>
                <div className="prevsheet__info">
                  <div className="prevsheet__when">{d.title || "—"}</div>
                  <div className="prevsheet__meta">
                    {d.meta}
                    {d.meta ? " · " : ""}saved {savedLabel(s.savedAt)}
                  </div>
                </div>
                <div className="toolbar__spacer" />
                <button
                  className="btn btn--primary btn--mini"
                  disabled={busy === s.id}
                  onClick={() => onImport(s.sheet, s.id)}
                >
                  Import
                </button>
                <button className="busrow__clear" disabled={busy === s.id} onClick={() => remove(s.id)}>
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        <div className="modal__actions">
          <div className="toolbar__spacer" />
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
    </Overlay>
  );
}
