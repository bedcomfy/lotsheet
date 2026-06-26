"use client";

import { useEffect, useState } from "react";
import Overlay from "./Overlay";
import type { HistoryEntry } from "../lib/store";

// Count how many buses are recorded on a sheet (grid cells + back-of-sheet lots).
function busCount(sheet: any): number {
  if (!sheet) return 0;
  const cells = sheet.cells ? Object.values(sheet.cells).filter(Boolean).length : 0;
  const lots = sheet.lots
    ? Object.values(sheet.lots).reduce((n: number, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    : 0;
  return cells + lots;
}

function savedLabel(iso: string | null | undefined): string {
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

interface PrevSheetsProps {
  onImport: (sheet: unknown, id: string) => void;
  onClose: () => void;
}

export default function PrevSheets({ onImport, onClose }: PrevSheetsProps) {
  const [sheets, setSheets] = useState<HistoryEntry[] | null>(null); // null = loading
  const [busy, setBusy] = useState<string | null>(null); // id being acted on

  useEffect(() => {
    fetch("/api/sheet/history")
      .then((r) => r.json())
      .then((d) => setSheets(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setSheets([]));
  }, []);

  async function remove(id: string) {
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
    <Overlay onClose={onClose} overlayClassName="modal-backdrop no-print" contentClassName="modal modal--tall" label="Prev Sheets">
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
          {(sheets || []).map((s) => {
            const sheet = s.sheet as { date?: string; time?: string } | null;
            return (
              <div className="prevsheet" key={s.id}>
                <div className="prevsheet__info">
                  <div className="prevsheet__when">
                    {sheet?.date || "—"} {sheet?.time || ""}
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
