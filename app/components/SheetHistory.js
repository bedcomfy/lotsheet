"use client";

import { useEffect, useState } from "react";
import { useScrollLock } from "../lib/useScrollLock";

function savedLabel(iso) {
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

// Generic "Prev Sheets" browser. `apiBase` is the history endpoint
// (e.g. /api/state/fuel/history); `describe(sheet)` returns { title, meta }.
export default function SheetHistory({ apiBase, title = "Prev Sheets", describe, onImport, onClose }) {
  useScrollLock();
  const [sheets, setSheets] = useState(null); // null = loading
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => setSheets(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setSheets([]));
  }, [apiBase]);

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function remove(id) {
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
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal modal--tall" onClick={(e) => e.stopPropagation()}>
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
          {sheets === null && <div className="lotlist__empty">Loading…</div>}
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
      </div>
    </div>
  );
}
