"use client";

import { useEffect, useMemo, useState } from "react";
import Overlay from "./Overlay";
import { Search, X, Trash2 } from "lucide-react";
import type { HistoryEntry } from "../lib/store";
import { SkeletonRows } from "./Skeleton";

interface WorkOrderHistoryProps {
  onLoad: (sheet: unknown, id: string) => void;
  onClose: () => void;
}

interface WOLike {
  workOrderNumber?: string;
  vehicleNumber?: string;
  todaysDate?: string;
  employees?: { badge?: string; name?: string }[];
  operations?: { num?: string; description?: string; objectCode?: string }[];
}

function savedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Match a work order against a lookup query: number, vehicle, any employee
// (name/badge), or any operation (number/description/object code).
function matches(wo: WOLike, q: string): boolean {
  if (!q) return true;
  const t = q.toLowerCase();
  if ((wo.workOrderNumber || "").toLowerCase().includes(t)) return true;
  if ((wo.vehicleNumber || "").toLowerCase().includes(t)) return true;
  if ((wo.employees || []).some((e) => (e.name || "").toLowerCase().includes(t) || (e.badge || "").toLowerCase().includes(t))) return true;
  if (
    (wo.operations || []).some(
      (o) =>
        (o.num || "").toLowerCase().includes(t) ||
        (o.description || "").toLowerCase().includes(t) ||
        (o.objectCode || "").toLowerCase().includes(t)
    )
  )
    return true;
  return false;
}

function employeeSummary(wo: WOLike): string {
  const names = (wo.employees || []).map((e) => (e.name || e.badge || "").trim()).filter(Boolean);
  return names.length ? names.join(", ") : "No employees";
}
function opSummary(wo: WOLike): string {
  const nums = (wo.operations || []).map((o) => (o.num || "").trim()).filter(Boolean);
  const n = (wo.operations || []).length;
  if (nums.length) return `Ops ${nums.join(", ")}`;
  return `${n} operation${n === 1 ? "" : "s"}`;
}

export default function WorkOrderHistory({ onLoad, onClose }: WorkOrderHistoryProps) {
  const [rows, setRows] = useState<HistoryEntry[] | null>(null); // null = loading
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/state/workorder/history")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setRows([]));
  }, []);

  async function remove(id: string) {
    if (!window.confirm("Delete this saved work order permanently?")) return;
    setBusy(id);
    try {
      const d = await fetch(`/api/state/workorder/history?id=${encodeURIComponent(id)}`, { method: "DELETE" })
        .then((r) => r.json())
        .catch(() => ({}));
      if (Array.isArray(d.sheets)) setRows(d.sheets);
      else setRows((cur) => (cur || []).filter((r) => r.id !== id));
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(() => (rows || []).filter((r) => matches((r.sheet || {}) as WOLike, q.trim())), [rows, q]);

  return (
    <Overlay onClose={onClose} overlayClassName="modal-backdrop no-print" contentClassName="modal modal--tall" label="Saved Work Orders">
      <div className="modal__head">
        <div>
          <div className="modal__title">Saved Work Orders</div>
          <div className="modal__sub">Look up by number, employee, operation, or vehicle.</div>
        </div>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="wohist__search">
        <Search size={16} className="wohist__searchic" />
        <input
          className="wohist__searchin"
          placeholder="Search saved work orders…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="wohist__searchx" onClick={() => setQ("")} aria-label="Clear">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="manager__list">
        {rows === null && <SkeletonRows rows={4} />}
        {rows !== null && rows.length === 0 && (
          <div className="lotlist__empty">No saved work orders yet — fill one out and press Save.</div>
        )}
        {rows !== null && rows.length > 0 && shown.length === 0 && <div className="lotlist__empty">No work orders match “{q}”.</div>}
        {shown.map((entry) => {
          const wo = (entry.sheet || {}) as WOLike;
          return (
            <div className="wohist__row" key={entry.id}>
              <button className="wohist__main" onClick={() => onLoad(entry.sheet, entry.id)}>
                <div className="wohist__top">
                  <span className="wohist__num">WO# {wo.workOrderNumber || "—"}</span>
                  <span className="wohist__date">{wo.todaysDate || savedLabel(entry.savedAt)}</span>
                </div>
                <div className="wohist__meta">
                  {employeeSummary(wo)} · {opSummary(wo)}
                </div>
              </button>
              <button
                className="lotitem__del"
                disabled={busy === entry.id}
                onClick={() => remove(entry.id)}
                aria-label="Delete"
                title="Delete this saved work order"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <button className="btn btn--block modal__save" onClick={onClose}>
        Done
      </button>
    </Overlay>
  );
}
