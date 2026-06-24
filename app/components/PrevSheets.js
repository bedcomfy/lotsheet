"use client";

import { useEffect, useState } from "react";

// Count how many buses are recorded on a sheet (grid cells + back-of-sheet lots).
function busCount(sheet) {
  if (!sheet) return 0;
  const cells = sheet.cells ? Object.values(sheet.cells).filter(Boolean).length : 0;
  const lots = sheet.lots
    ? Object.values(sheet.lots).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    : 0;
  return cells + lots;
}

function savedLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function PrevSheets({ onImport, onClose }) {
  const [sheets, setSheets] = useState(null); // null = loading
  const [busy, setBusy] = useState(null); // id being acted on

  useEffect(() => {
    fetch("/api/sheet/history")
      .then((r) => r.json())
      .then((d) => setSheets(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setSheets([]));
  }, []);

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function remove(id) {
    if (!window.confirm("Delete this saved sheet permanently?")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/sheet/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
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
            <div className="modal__title">Prev Sheets</div>
            <div className="modal__sub">
              The last 20 sheets are kept. Import one to continue it, or delete it.
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
              No saved sheets yet. When you start a new sheet, the old one is kept here.
            </div>
          )}
          {(sheets || []).map((s) => (
            <div className="prevsheet" key={s.id}>
              <div className="prevsheet__info">
                <div className="prevsheet__when">
                  {s.sheet?.date || "—"} {s.sheet?.time || ""}
                </div>
                <div className="prevsheet__meta">
                  {busCount(s.sheet)} bus{busCount(s.sheet) === 1 ? "" : "es"} · saved{" "}
                  {savedLabel(s.savedAt)}
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
              <button
                className="busrow__clear"
                disabled={busy === s.id}
                onClick={() => remove(s.id)}
              >
                Delete
              </button>
            </div>
          ))}
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
