"use client";

import { useEffect, useState } from "react";
import type { HistoryEntry } from "../lib/store";
import { SkeletonRows } from "./Skeleton";
import { Button, ConfirmDialog, ResponsiveDialog } from "../ui";
import historyStyles from "./HistoryList.module.css";

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
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sheet/history")
      .then((r) => r.json())
      .then((d) => setSheets(Array.isArray(d.sheets) ? d.sheets : []))
      .catch(() => setSheets([]));
  }, []);

  async function remove(id: string) {
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
    <>
      <ResponsiveDialog
        isOpen={!deleteId}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Previous sheets"
        description="The last 20 sheets are kept. Import one to continue it, or delete it."
        size="md"
        footer={(close) => <Button variant="primary" onPress={close}>Done</Button>}
      >
        <div className={historyStyles.list}>
          {sheets === null && <SkeletonRows rows={4} />}
          {sheets !== null && sheets.length === 0 && (
            <div className={historyStyles.empty}>
              No saved sheets yet. When you start a new sheet, the old one is kept here.
            </div>
          )}
          {(sheets || []).map((s) => {
            const sheet = s.sheet as { date?: string; time?: string } | null;
            return (
              <div className={historyStyles.row} key={s.id}>
                <div className={historyStyles.info}>
                  <div className={historyStyles.title}>
                    {sheet?.date || "—"} {sheet?.time || ""}
                  </div>
                  <div className={historyStyles.meta}>
                    {busCount(s.sheet)} bus{busCount(s.sheet) === 1 ? "" : "es"} · saved{" "}
                    {savedLabel(s.savedAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={busy === s.id}
                  onPress={() => onImport(s.sheet, s.id)}
                >
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  isDisabled={busy === s.id}
                  onPress={() => setDeleteId(s.id)}
                >
                  Delete
                </Button>
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
        title="Delete this saved sheet?"
        description="This saved sheet will be permanently deleted."
        confirmLabel="Delete sheet"
        tone="danger"
        isPending={!!deleteId && busy === deleteId}
        onConfirm={async () => {
          if (deleteId) await remove(deleteId);
        }}
      />
    </>
  );
}
