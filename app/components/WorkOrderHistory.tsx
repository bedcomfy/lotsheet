"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { HistoryEntry } from "../lib/store";
import { SkeletonRows } from "./Skeleton";
import {
  Button,
  ConfirmDialog,
  IconButton,
  Pressable,
  ResponsiveDialog,
  SearchField,
} from "../ui";
import historyStyles from "./HistoryList.module.css";

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
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/state/workorder/history")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setRows([]));
  }, []);

  async function remove(id: string) {
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
    <>
      <ResponsiveDialog
        isOpen={!deleteId}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Saved Work Orders"
        description="Look up by number, employee, operation, or vehicle."
        size="lg"
        footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
      >
        <SearchField
          label="Search saved work orders"
          labelHidden
          placeholder="Search saved work orders…"
          value={q}
          onChange={setQ}
        />

      <div className={historyStyles.list}>
        {rows === null && <SkeletonRows rows={4} />}
        {rows !== null && rows.length === 0 && (
          <div className={historyStyles.empty}>No saved work orders yet — fill one out and press Save.</div>
        )}
        {rows !== null && rows.length > 0 && shown.length === 0 && (
          <div className={historyStyles.empty}>No work orders match “{q}”.</div>
        )}
        {shown.map((entry) => {
          const wo = (entry.sheet || {}) as WOLike;
          return (
            <div className={historyStyles.row} key={entry.id}>
              <Pressable className={historyStyles.workOrderMain} onPress={() => onLoad(entry.sheet, entry.id)}>
                <div className={historyStyles.workOrderTop}>
                  <span className={historyStyles.title}>WO# {wo.workOrderNumber || "—"}</span>
                  <span className={historyStyles.date}>{wo.todaysDate || savedLabel(entry.savedAt)}</span>
                </div>
                <div className={historyStyles.meta}>
                  {employeeSummary(wo)} · {opSummary(wo)}
                </div>
              </Pressable>
              <IconButton
                variant="danger"
                size="sm"
                isDisabled={busy === entry.id}
                onPress={() => setDeleteId(entry.id)}
                aria-label="Delete"
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          );
        })}
      </div>
      </ResponsiveDialog>
      <ConfirmDialog
        isOpen={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete this saved work order?"
        description="This saved work order will be permanently deleted."
        confirmLabel="Delete work order"
        tone="danger"
        isPending={!!deleteId && busy === deleteId}
        onConfirm={async () => {
          if (deleteId) await remove(deleteId);
        }}
      />
    </>
  );
}
