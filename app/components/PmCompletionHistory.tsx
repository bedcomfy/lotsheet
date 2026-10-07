"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Button, ConfirmDialog, EmptyState, IconButton, Panel, ResponsiveDialog, SearchField } from "../ui";
import { completedBusRows, completionCreditLabel, completionDateText, completionTimestamp, type PmInspectionEntry } from "../lib/pmHistory";
import { formatMiles, type PmRecord } from "../lib/pmMileage";
import { getDeviceActor } from "../lib/deviceActor";
import type { MasterBus } from "../lib/types";
import styles from "./PmCompletionHistory.module.css";

export default function PmCompletionHistory({ buses, records, label, onUpdated }: {
  buses: MasterBus[]; records: Record<string, PmRecord>; label: (bus: string) => string;
  onUpdated: (record: PmRecord) => void;
}) {
  const [entries, setEntries] = useState<PmInspectionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedBus, setSelectedBus] = useState<string | null>(null);
  const [history, setHistory] = useState<PmInspectionEntry[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [undo, setUndo] = useState<PmInspectionEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const response = await fetch("/api/pm-mileage/history", { cache: "no-store" });
    if (!response.ok) throw new Error("Couldn't load completed inspections. Try again.");
    const data = await response.json();
    if (version !== loadVersion.current) return;
    setEntries(data.entries || []);
    setLoaded(true);
    setError("");
  }, []);
  useEffect(() => {
    void load().catch((err) => setError(err.message));
    return () => { ++loadVersion.current; };
  }, [load, records]);
  useEffect(() => {
    let alive = true;
    setHistory(null);
    setHistoryError("");
    if (selectedBus) fetch(`/api/pm-mileage/history?bus=${encodeURIComponent(selectedBus)}`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("Couldn't load this bus's history."); return r.json(); })
      .then((d) => { if (alive) setHistory(d.entries || []); })
      .catch((err) => { if (alive) setHistoryError(err.message); });
    return () => { alive = false; };
  }, [selectedBus, records]);

  const rows = useMemo(() => completedBusRows(buses, entries).filter((row) => {
    const bus = buses.find((item) => item.num === row.bus);
    return `${row.bus} ${label(row.bus)} ${bus?.model || ""} ${row.entry?.foremanSr || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [buses, entries, label, query]);

  async function confirmUndo() {
    if (!undo) return;
    setBusy(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/pm-mileage/undo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: undo.id, actor: getDeviceActor() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn't undo this completion.");
      onUpdated(result.record);
      await load();
    } catch (err) { setHistoryError(err instanceof Error ? err.message : "Couldn't undo this completion."); }
    finally { setBusy(false); setUndo(null); }
  }

  return <>
    <Panel title="Recently completed inspections" description={`All ${buses.length} buses · Site completions only, newest first · Times shown in Chicago time`}>
      <SearchField label="Search completed buses" placeholder="Bus number, model, or name" value={query} onChange={setQuery} />
      {error && <p role="alert">{error} <Button variant="quiet" onPress={() => { void load().catch((err) => setError(err.message)); }}>Retry</Button></p>}
      {!loaded && !error ? <p role="status">Loading completed inspections…</p> : rows.length === 0
        ? <EmptyState title="No buses match" description="Try another bus number or name." />
        : <div className={styles.table} role="table" aria-label="Completed inspections">
          <div className={`${styles.row} ${styles.head}`} role="row">
            {["Bus", "Last completed PM", "Completed", "Recorded mileage", "Completed by", "Info"].map((title) => <span key={title} role="columnheader">{title}</span>)}
          </div>
          {rows.map((row) => <div className={styles.row} role="row" aria-label={`Completed work for bus ${row.bus}`} key={row.bus}>
            <div role="cell" data-label="Bus"><strong>{label(row.bus)}</strong></div>
            <div role="cell" data-label="Last completed PM">{row.kind === "trans" ? "Trans PM" : row.type || "No completion recorded"}</div>
            <div role="cell" data-label="Completed">{row.entry ? completionDateText(row.completedAt) : "—"}</div>
            <div role="cell" data-label="Recorded mileage">{row.miles === null ? "—" : formatMiles(row.miles)}</div>
            <div role="cell" data-label="Completed by">{row.entry ? completionCreditLabel(row.entry) : "—"}</div>
            <div role="cell" data-label="Info"><IconButton variant="quiet" aria-label={`Completion info for bus ${row.bus}`} onPress={() => setSelectedBus(row.bus)}><Info aria-hidden="true" /></IconButton></div>
          </div>)}
        </div>}
    </Panel>
    <ResponsiveDialog isOpen={selectedBus !== null} onOpenChange={(open) => { if (!open) setSelectedBus(null); }}
      title={`Completion history · Bus ${selectedBus ? label(selectedBus) : ""}`}
      description="Review recorded work or undo an accidental completion. Dates and times are shown in Chicago time."
      footer={<Button onPress={() => setSelectedBus(null)}>Close</Button>}>
      {historyError && <p role="alert">{historyError}</p>}
      {!history && !historyError && <p role="status">Loading history…</p>}
      {history?.length === 0 && <div className={styles.entry}>
        <p>No PMs have been completed through this site for this bus yet.</p>
      </div>}
      {history?.map((entry) => <article className={styles.entry} key={entry.id}>
        <strong>{entry.kind === "trans" ? "Trans PM" : entry.type || "Inspection"}{entry.undoneAt ? " · Undone" : ""}</strong>
        <p>{completionDateText(completionTimestamp(entry))}</p>
        <p>Recorded mileage: {formatMiles(entry.miles)}</p>
        <p>{completionCreditLabel(entry)}</p>
        {entry.canUndo ? <Button onPress={() => setUndo(entry)}>Undo completion</Button>
          : !entry.undoneAt && <p className={styles.muted}>{entry.undoReason}</p>}
      </article>)}
    </ResponsiveDialog>
    <ConfirmDialog isOpen={undo !== null} onOpenChange={(open) => { if (!open) setUndo(null); }}
      title={`Undo ${undo?.kind === "trans" ? "Trans PM" : undo?.type || "inspection"} completion?`}
      description="Restore this PM's previous schedule and return it to upcoming work. Current mileage, notes, bus status, and the other PM schedule are kept."
      confirmLabel="Undo completion" isPending={busy} onConfirm={confirmUndo} />
  </>;
}
