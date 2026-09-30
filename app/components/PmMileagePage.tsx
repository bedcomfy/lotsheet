"use client";

// PM Mileage: every active bus with its latest odometer reading, the last PM
// mark, and how many miles are left before the next inspection. Cells edit in
// place; "Import PDF" scans a mileage report and proposes new readings for
// review before anything is saved. Printable PM reports hang off this data
// later — this page is the working list.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { AlertTriangle, FileUp, Gauge, RefreshCw, Settings2 } from "lucide-react";
import { getDeviceActor } from "../lib/deviceActor";
import {
  DEFAULT_PM_SETTINGS,
  PM_STATUS_LABEL,
  emptyPmRecord,
  formatMiles,
  milesRemaining,
  nextPmDue,
  pmInterval,
  pmStatus,
  sortPmRecords,
  toMiles,
  type PmReadingRejection,
  type PmReadingReview,
  type PmRecord,
  type PmSettings,
  type PmStatus,
} from "../lib/pmMileage";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import {
  AppPage,
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  Panel,
  ResponsiveDialog,
  SearchField,
  SelectField,
  StatusBadge,
  TextField,
} from "../ui";
import AdminUnlockButton from "./AdminUnlockButton";
import { useBusMaster } from "./BusMasterProvider";
import SaveStatus, { useSaveState } from "./SaveStatus";
import TypeCodes from "./TypeCodes";
import styles from "./PmMileagePage.module.css";

type Filter = "all" | "overdue" | "due-soon" | "ok" | "unknown";
type EditableField = "odometer" | "odometerDate" | "lastPmMiles" | "lastPmDate" | "interval" | "note";

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All buses" },
  { id: "overdue", label: "Overdue" },
  { id: "due-soon", label: "Due soon" },
  { id: "ok", label: "OK" },
  { id: "unknown", label: "No reading" },
];

const TONE: Record<PmStatus, "danger" | "warning" | "success" | "neutral"> = {
  overdue: "danger",
  "due-soon": "warning",
  ok: "success",
  unknown: "neutral",
};

// One in-place cell: shows the stored value, keeps a local draft while typing,
// and commits on Enter or blur only when something changed.
function Cell({
  value,
  display,
  placeholder,
  label,
  numeric,
  onCommit,
}: {
  value: string;
  display?: string;
  placeholder?: string;
  label: string;
  numeric?: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? display ?? value;
  function commit() {
    if (draft !== null && draft.trim() !== value.trim()) onCommit(draft.trim());
    setDraft(null);
  }
  return (
    <TextField
      className={styles.cell}
      label={label}
      labelHidden
      placeholder={placeholder}
      inputMode={numeric ? "numeric" : undefined}
      value={shown}
      onChange={(next) => setDraft(next)}
      onFocus={() => setDraft(value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
        } else if (event.key === "Escape") {
          setDraft(null);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export default function PmMileagePage() {
  const { buses, label, ready: fleetReady } = useBusMaster();
  const { unlocked, tryUnlock } = useAdminUnlock();
  const [records, setRecords] = useState<Record<string, PmRecord>>({});
  const [settings, setSettings] = useState<PmSettings>(DEFAULT_PM_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [saveState, markSave] = useSaveState();
  const [saveError, setSaveError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/pm-mileage", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRecords(d.records || {});
      setSettings(d.settings || DEFAULT_PM_SETTINGS);
      setLoadError("");
    } catch (err) {
      setLoadError(`Couldn't load PM mileage (${err instanceof Error ? err.message : "error"}).`);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => buses.filter((b) => b.status !== "retired"), [buses]);
  const rows = useMemo(() => {
    const all = active.map((b) => records[b.num] || emptyPmRecord(b.num));
    const q = query.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (filter !== "all" && pmStatus(r, settings) !== filter) return false;
      if (!q) return true;
      const bus = active.find((b) => b.num === r.bus);
      return (
        r.bus.includes(q) ||
        label(r.bus).toLowerCase().includes(q) ||
        (bus?.model || "").toLowerCase().includes(q)
      );
    });
    return sortPmRecords(filtered, settings);
  }, [active, records, query, filter, settings, label]);

  const counts = useMemo(() => {
    const c: Record<PmStatus, number> = { overdue: 0, "due-soon": 0, ok: 0, unknown: 0 };
    for (const b of active) c[pmStatus(records[b.num] || emptyPmRecord(b.num), settings)] += 1;
    return c;
  }, [active, records, settings]);

  async function save(bus: string, field: EditableField, raw: string) {
    markSave("saving");
    setSaveError("");
    const value = field === "note" || field === "odometerDate" || field === "lastPmDate" ? raw : toMiles(raw);
    try {
      const r = await fetch("/api/pm-mileage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bus, [field]: value === "" ? null : value, actor: getDeviceActor() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.record) setRecords((cur) => ({ ...cur, [bus]: d.record }));
      markSave("saved");
    } catch (err) {
      markSave("error");
      setSaveError(`Bus ${bus} didn't save (${err instanceof Error ? err.message : "error"}). Try again.`);
    }
  }

  return (
    <AppPage className={styles.page}>
      <PageHeader
        eyebrow="Preventive Maintenance"
        title="PM Mileage"
        description="Each bus's latest odometer reading and the miles left before its next PM inspection. Type in a cell to update it, or import a mileage report PDF."
        actions={
          <div className={styles.headerActions}>
            <SaveStatus state={saveState} />
            <Button variant="quiet" onPress={load} aria-label="Refresh">
              <RefreshCw aria-hidden="true" /> Refresh
            </Button>
            <Button onPress={() => setSettingsOpen(true)}>
              <Settings2 aria-hidden="true" /> Interval
            </Button>
            <Button variant="primary" onPress={() => setImportOpen(true)}>
              <FileUp aria-hidden="true" /> Import PDF
            </Button>
          </div>
        }
      />

      <div className={styles.tiles} role="list" aria-label="PM status counts">
        {(["overdue", "due-soon", "ok", "unknown"] as PmStatus[]).map((status) => (
          <button
            type="button"
            role="listitem"
            key={status}
            className={styles.tile}
            data-tone={TONE[status]}
            data-active={filter === status || undefined}
            onClick={() => setFilter((cur) => (cur === status ? "all" : status))}
          >
            <strong>{counts[status]}</strong>
            <span>{PM_STATUS_LABEL[status]}</span>
          </button>
        ))}
        <div className={styles.tileNote}>
          Default interval <strong>{formatMiles(settings.defaultInterval)}</strong> mi · due soon within{" "}
          <strong>{formatMiles(settings.dueSoonMiles)}</strong> mi
        </div>
      </div>

      {(loadError || saveError) && (
        <div className={styles.errorBanner} role="alert">
          <AlertTriangle aria-hidden="true" /> {loadError || saveError}
        </div>
      )}

      <Panel className={styles.panel} title="Fleet" description={`${rows.length} of ${active.length} active buses`}>
        <div className={styles.toolbar}>
          <SearchField
            label="Search buses"
            labelHidden
            placeholder="Bus number, model, or name"
            value={query}
            onChange={setQuery}
          />
          <SelectField
            className={styles.filter}
            label="Show"
            selectedKey={filter}
            onSelectionChange={(key) => setFilter(String(key) as Filter)}
            options={FILTER_OPTIONS}
          />
        </div>

        {loaded && fleetReady && rows.length === 0 ? (
          <EmptyState title="No buses match" description="Try another filter or search." />
        ) : (
          <div className={styles.table} role="table" aria-label="PM mileage by bus">
            <div className={`${styles.row} ${styles.head}`} role="row">
              <span role="columnheader">Bus</span>
              <span role="columnheader">Odometer</span>
              <span role="columnheader">As of</span>
              <span role="columnheader">Last PM at</span>
              <span role="columnheader">Last PM date</span>
              <span role="columnheader">Interval</span>
              <span role="columnheader">Next PM due</span>
              <span role="columnheader">Miles left</span>
              <span role="columnheader">Note</span>
            </div>
            {rows.map((r) => {
              const status = pmStatus(r, settings);
              const left = milesRemaining(r, settings);
              const due = nextPmDue(r, settings);
              const bus = active.find((b) => b.num === r.bus);
              return (
                <div className={styles.row} role="row" key={r.bus} data-status={status}>
                  <div className={styles.busCell} role="cell">
                    <strong>{label(r.bus)}</strong>
                    <span className={styles.model}>
                      <TypeCodes num={r.bus} variant="ui" />
                      {bus?.model ? <span>{bus.model}</span> : null}
                    </span>
                  </div>
                  <div role="cell" data-label="Odometer">
                    <Cell
                      label={`Bus ${r.bus} odometer`}
                      numeric
                      value={r.odometer === null ? "" : String(r.odometer)}
                      display={formatMiles(r.odometer)}
                      placeholder="miles"
                      onCommit={(v) => save(r.bus, "odometer", v)}
                    />
                  </div>
                  <div role="cell" data-label="As of">
                    <Cell
                      label={`Bus ${r.bus} reading date`}
                      value={r.odometerDate || ""}
                      placeholder="date"
                      onCommit={(v) => save(r.bus, "odometerDate", v)}
                    />
                  </div>
                  <div role="cell" data-label="Last PM at">
                    <Cell
                      label={`Bus ${r.bus} last PM mileage`}
                      numeric
                      value={r.lastPmMiles === null ? "" : String(r.lastPmMiles)}
                      display={formatMiles(r.lastPmMiles)}
                      placeholder="miles"
                      onCommit={(v) => save(r.bus, "lastPmMiles", v)}
                    />
                  </div>
                  <div role="cell" data-label="Last PM date">
                    <Cell
                      label={`Bus ${r.bus} last PM date`}
                      value={r.lastPmDate || ""}
                      placeholder="date"
                      onCommit={(v) => save(r.bus, "lastPmDate", v)}
                    />
                  </div>
                  <div role="cell" data-label="Interval">
                    <Cell
                      label={`Bus ${r.bus} PM interval`}
                      numeric
                      value={r.interval === null ? "" : String(r.interval)}
                      display={r.interval === null ? "" : formatMiles(r.interval)}
                      placeholder={formatMiles(pmInterval(r, settings))}
                      onCommit={(v) => save(r.bus, "interval", v)}
                    />
                  </div>
                  <div role="cell" data-label="Next PM due" className={styles.derived}>
                    {due === null ? <span className={styles.muted}>—</span> : formatMiles(due)}
                  </div>
                  <div role="cell" data-label="Miles left" className={styles.derived}>
                    <StatusBadge tone={TONE[status]} size="sm">
                      {left === null ? PM_STATUS_LABEL.unknown : left < 0 ? `${formatMiles(-left)} over` : formatMiles(left)}
                    </StatusBadge>
                  </div>
                  <div role="cell" data-label="Note">
                    <Cell
                      label={`Bus ${r.bus} note`}
                      value={r.note || ""}
                      placeholder="note"
                      onCommit={(v) => save(r.bus, "note", v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <ImportDialog
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        unlocked={unlocked}
        tryUnlock={tryUnlock}
        onApplied={load}
      />
      <SettingsDialog
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        unlocked={unlocked}
        tryUnlock={tryUnlock}
        onSaved={(next) => setSettings(next)}
      />
    </AppPage>
  );
}

// ---------- Import PDF ----------
interface ImportResult {
  accepted: PmReadingReview[];
  rejected: PmReadingRejection[];
  reportDate: string | null;
  notes: string | null;
  fileName: string;
  rawCount: number;
}

function ImportDialog({
  isOpen,
  onOpenChange,
  unlocked,
  tryUnlock,
  onApplied,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  unlocked: boolean;
  tryUnlock: (password: string) => Promise<boolean>;
  onApplied: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setBusy(false);
      setError("");
      setResult(null);
      setPicked(new Set());
      setDone(null);
    }
  }, [isOpen]);

  async function scan() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await fetch("/api/pm-mileage/import", { method: "POST", body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      setPicked(new Set((d.accepted as PmReadingReview[]).filter((x) => !x.warning).map((x) => x.bus)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    const readings = result.accepted
      .filter((x) => picked.has(x.bus))
      .map((x) => ({ bus: x.bus, odometer: x.odometer, readAt: x.readAt }));
    if (!readings.length) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pm-mileage/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings, source: "pdf", actor: getDeviceActor() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDone(d.applied?.length ?? readings.length);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the readings.");
    } finally {
      setBusy(false);
    }
  }

  function togglePicked(bus: string, on: boolean) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(bus);
      else next.delete(bus);
      return next;
    });
  }

  const footer = done !== null ? (
    <Button variant="primary" onPress={() => onOpenChange(false)}>Done</Button>
  ) : result ? (
    <>
      <Button variant="quiet" onPress={() => setResult(null)} isDisabled={busy}>Scan another</Button>
      <Button variant="primary" onPress={apply} isDisabled={busy || picked.size === 0}>
        {busy ? "Saving…" : `Apply ${picked.size} reading${picked.size === 1 ? "" : "s"}`}
      </Button>
    </>
  ) : (
    <Button variant="primary" onPress={scan} isDisabled={!file || busy || !unlocked}>
      {busy ? "Scanning…" : "Scan PDF"}
    </Button>
  );

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Import a mileage report"
      description="Upload the PDF. The readings it contains are listed for review before anything changes."
      size="lg"
      footer={<div className={styles.dialogFooter}>{footer}</div>}
    >
      <div className={styles.importBody}>
        {!unlocked && (
          <div className={styles.notice}>
            Scanning a report needs Admin Tools. <AdminUnlockButton label="Unlock" onSubmit={tryUnlock} />
          </div>
        )}
        {done !== null ? (
          <div className={styles.doneNote}>
            <Gauge aria-hidden="true" /> Saved {done} reading{done === 1 ? "" : "s"} from {result?.fileName}.
          </div>
        ) : !result ? (
          <label className={styles.filePick}>
            <span>Mileage report (PDF)</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)}
            />
            {file && (
              <span className={styles.fileName}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            )}
          </label>
        ) : (
          <>
            <div className={styles.reviewSummary}>
              <strong>{result.fileName}</strong>
              {result.reportDate ? <span> · report dated {result.reportDate}</span> : null}
              <span> · {result.rawCount} row{result.rawCount === 1 ? "" : "s"} found</span>
              {result.notes ? <p>{result.notes}</p> : null}
            </div>
            {result.accepted.length === 0 ? (
              <EmptyState title="No usable readings" description="Nothing in this PDF matched a bus in the fleet list." />
            ) : (
              <div className={styles.reviewList}>
                {result.accepted.map((row) => (
                  <div className={styles.reviewRow} key={row.bus} data-warning={row.warning ? "" : undefined}>
                    <Checkbox isSelected={picked.has(row.bus)} onChange={(on) => togglePicked(row.bus, on)}>
                      <strong>{row.bus}</strong>
                    </Checkbox>
                    <span className={styles.reviewMiles}>{formatMiles(row.odometer)}</span>
                    <span className={styles.reviewDelta}>
                      {row.previous === null
                        ? "first reading"
                        : `${row.delta !== null && row.delta >= 0 ? "+" : ""}${formatMiles(row.delta)} from ${formatMiles(row.previous)}`}
                    </span>
                    <span className={styles.reviewDate}>{row.readAt || ""}</span>
                    {row.warning && (
                      <span className={styles.reviewWarning}>
                        <AlertTriangle aria-hidden="true" /> {row.warning}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {result.rejected.length > 0 && (
              <details className={styles.rejected}>
                <summary>{result.rejected.length} row{result.rejected.length === 1 ? "" : "s"} skipped</summary>
                <ul>
                  {result.rejected.map((row, i) => (
                    <li key={`${row.bus}-${i}`}>
                      <strong>{row.bus}</strong> {row.odometer !== null ? formatMiles(row.odometer) : ""} — {row.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle aria-hidden="true" /> {error}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

// ---------- Interval settings ----------
function SettingsDialog({
  isOpen,
  onOpenChange,
  settings,
  unlocked,
  tryUnlock,
  onSaved,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PmSettings;
  unlocked: boolean;
  tryUnlock: (password: string) => Promise<boolean>;
  onSaved: (next: PmSettings) => void;
}) {
  const [interval, setInterval] = useState(String(settings.defaultInterval));
  const [dueSoon, setDueSoon] = useState(String(settings.dueSoonMiles));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInterval(String(settings.defaultInterval));
      setDueSoon(String(settings.dueSoonMiles));
      setError("");
    }
  }, [isOpen, settings]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pm-mileage/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultInterval: interval, dueSoonMiles: dueSoon, actor: getDeviceActor() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("Unlock Admin Tools first.");
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved(d.settings);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="PM interval"
      description="Applies to every bus without its own interval. Changing it moves every next-due mark."
      size="sm"
      footer={
        <div className={styles.dialogFooter}>
          <Button variant="quiet" onPress={() => onOpenChange(false)} isDisabled={busy}>Cancel</Button>
          <Button variant="primary" onPress={submit} isDisabled={busy || !unlocked}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className={styles.settingsBody}>
        {!unlocked && (
          <div className={styles.notice}>
            Changing the interval needs Admin Tools. <AdminUnlockButton label="Unlock" onSubmit={tryUnlock} />
          </div>
        )}
        <TextField label="Miles between PM inspections" inputMode="numeric" value={interval} onChange={setInterval} />
        <TextField label="Show “Due soon” within (miles)" inputMode="numeric" value={dueSoon} onChange={setDueSoon} />
        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle aria-hidden="true" /> {error}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
