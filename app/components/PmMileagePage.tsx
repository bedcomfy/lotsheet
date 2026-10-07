"use client";

// PM Mileage lists each inspection and transmission PM as separate work,
// sorted by its own miles left. The bus status is shared across its rows.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Copy, FileDown, FileUp, Gauge, Lock, RefreshCw } from "lucide-react";
import { openSheetPdf } from "../lib/pdf";
import { PmMileagePaper } from "../sheets/pm-mileage/PmMileagePaper";
import { chicagoDateShort } from "../lib/chicagoTime";
import { pmScheduleToken } from "../lib/pmHistory";
import type { MileageSyncStatus } from "../lib/fleetwatch";
import { serviceTimeParts } from "../lib/vehicleServiceReport";
import { readPdfTextInBrowser } from "../lib/pdfTextClient";
import { odometerLinesFor, odometerTable } from "../lib/pmTracker";
import { getDeviceActor } from "../lib/deviceActor";
import { inspectionOptionFromText, removeInspection } from "../lib/grid";
import {
  DEFAULT_PM_SETTINGS,
  INSPECTION_CYCLE,
  PM_DISPOSITIONS,
  PM_DISPOSITION_LABEL,
  PM_STATUS_LABEL,
  TRANS_PM_INTERVAL,
  TRANS_PM_NOTE,
  completionRecordedAt,
  emptyPmRecord,
  formatMiles,
  formatTenths,
  filterPmWorkItems,
  groupPmWorkItems,
  isInspectionType,
  isPmFleetBus,
  nextInspection,
  pmWorkItems,
  pmDisplayDisposition,
  toMiles,
  transNextDue,
  type InspectionType,
  type PmKind,
  type PmFilter,
  type PmReadingRejection,
  type PmReadingReview,
  type PmRecord,
  type PmSettings,
  type PmStatus,
} from "../lib/pmMileage";
import type { FlagMap, MasterBus } from "../lib/types";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import {
  ActionMenu,
  AppPage,
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  Panel,
  Pressable,
  ResponsiveDialog,
  SearchField,
  SelectField,
  StatusBadge,
  TabBar,
  TextField,
} from "../ui";
import AdminLogoutButton from "./AdminLogoutButton";
import AdminUnlockButton from "./AdminUnlockButton";
import PmCompletionHistory from "./PmCompletionHistory";
import { useBusMaster } from "./BusMasterProvider";
import SaveStatus, { useSaveState } from "./SaveStatus";
import TypeCodes from "./TypeCodes";
import styles from "./PmMileagePage.module.css";

type Filter = PmFilter;
type EditableField =
  | "odometer"
  | "odometerDate"
  | "lastInspType"
  | "lastInspMiles"
  | "lastInspDate"
  | "lastTransMiles"
  | "lastTransDate"
  | "disposition"
  | "note";
const MILES_FIELDS: ReadonlySet<EditableField> = new Set(["odometer", "lastInspMiles", "lastTransMiles"]);

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All PMs" },
  { id: "overdue", label: "Overdue" },
  { id: "due-soon", label: "Due soon" },
  { id: "ok", label: "OK" },
  { id: "unknown", label: "No record" },
];

const TYPE_OPTIONS = [
  { id: "", label: "—" },
  ...INSPECTION_CYCLE.map((type) => ({ id: type, label: type })),
];

const DISPOSITION_OPTIONS = PM_DISPOSITIONS.map((id) => ({ id, label: PM_DISPOSITION_LABEL[id] }));

const TONE: Record<PmStatus, "danger" | "warning" | "success" | "neutral"> = {
  overdue: "danger",
  "due-soon": "warning",
  ok: "success",
  unknown: "neutral",
};

// "1,200" / "300 over" / "No record" for a miles-left figure.
function milesLeftLabel(left: number | null): string {
  if (left === null) return PM_STATUS_LABEL.unknown;
  return left < 0 ? `${formatTenths(-left)} over` : formatTenths(left);
}

// The inspection the sheet's flag says is due, if it's one of the cycle types.
function flaggedInspection(flags: FlagMap, bus: string): InspectionType | null {
  const entry = flags[bus];
  if (!entry || !(entry.flags || []).includes("inspection")) return null;
  const id = inspectionOptionFromText(entry.inspOption)?.id;
  return isInspectionType(id) ? id : null;
}

function hasInspectionFlag(flags: FlagMap, bus: string): boolean {
  return Boolean((flags[bus]?.flags || []).includes("inspection"));
}

// One in-place cell: shows the stored value, keeps a local draft while typing,
// and commits on Enter or blur only when something changed.
function Cell({
  value,
  display,
  placeholder,
  label,
  numeric,
  readOnly,
  onCommit,
}: {
  value: string;
  display?: string;
  placeholder?: string;
  label: string;
  numeric?: boolean;
  readOnly?: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? display ?? value;
  if (readOnly) {
    const text = display ?? value;
    return (
      <span className={styles.readCell} data-empty={text ? undefined : ""} aria-label={label}>
        {text || "—"}
      </span>
    );
  }
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
      inputMode={numeric ? "decimal" : undefined}
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

interface CompleteTarget {
  bus: string;
  kind: PmKind;
}

export default function PmMileagePage() {
  const { buses, label, ready: fleetReady } = useBusMaster();
  const { unlocked, tryUnlock } = useAdminUnlock();
  const [records, setRecords] = useState<Record<string, PmRecord>>({});
  const [settings, setSettings] = useState<PmSettings>(DEFAULT_PM_SETTINGS);
  const [flags, setFlags] = useState<FlagMap>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"upcoming" | "completed">("upcoming");
  const [saveState, markSave] = useSaveState();
  const [saveError, setSaveError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [completing, setCompleting] = useState<CompleteTarget | null>(null);
  const [editing, setEditing] = useState<CompleteTarget | null>(null);
  const [editingNext, setEditingNext] = useState<CompleteTarget | null>(null);
  const [savingStatus, setSavingStatus] = useState<Set<string>>(new Set());
  const [sync, setSync] = useState<MileageSyncStatus>({});
  const autoSync = sync.enabled === true;
  const [forcing, setForcing] = useState(false);
  const [forceMessage, setForceMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [showSyncSkipped, setShowSyncSkipped] = useState(false);
  const loadVersion = useRef(0);

  useEffect(() => {
    if (!unlocked) {
      setEditing(null);
      setEditingNext(null);
      setImportOpen(false);
    }
  }, [unlocked]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const [r, f] = await Promise.all([
        fetch("/api/pm-mileage", { cache: "no-store" }),
        fetch("/api/flags", { cache: "no-store" }).catch(() => null),
      ]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (version !== loadVersion.current) return;
      setRecords(d.records || {});
      setSettings(d.settings || DEFAULT_PM_SETTINGS);
      setSync(d.sync || {});
      if (f && f.ok) {
        const fd = await f.json().catch(() => ({}));
        if (version !== loadVersion.current) return;
        setFlags(fd.flags || {});
      }
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

  // Background jobs run on the server even with every browser closed. This
  // only refreshes the open sheet; never replace data underneath an edit.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || saveState === "saving" || syncing || editing || editingNext || completing || importOpen) return;
      if (document.activeElement?.closest("input, textarea, [role=dialog], [role=listbox]")) return;
      void load();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load, saveState, syncing, editing, editingNext, completing, importOpen]);

  // Force Update: the server fetches Fleetwatch's always-current Vehicle List
  // Report (the dateless URL) and applies its odometers now. Anyone can press it.
  async function forceUpdate() {
    setForcing(true);
    setForceMessage("");
    try {
      const response = await fetch("/api/pm-mileage/force-update", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (result.status) setSync((prev) => ({ ...prev, ...result.status }));
      if (result.busy) setForceMessage("An update is already running. This sheet will refresh when it finishes.");
      else if (result.cooldown) setForceMessage("Mileage was updated less than a minute ago. Try again shortly.");
      else if (!response.ok || !result.ok) setForceMessage(result.error || "Couldn't update mileage from Fleetwatch. Try again.");
      else {
        const st = result.status || {};
        setForceMessage(`Force Update done: ${st.updated ?? 0} updated · ${st.unchanged ?? 0} unchanged${st.skipped?.length ? ` · ${st.skipped.length} skipped` : ""}.`);
      }
      await load();
    } catch (error) {
      setForceMessage(error instanceof Error ? error.message : "Couldn't update mileage from Fleetwatch. Try again.");
    } finally { setForcing(false); }
  }

  async function updateMileageNow() {
    setSyncing(true);
    setSyncMessage("");
    loadVersion.current += 1;
    try {
      const response = await fetch("/api/pm-mileage/sync", { method: "POST" });
      const result = await response.json();
      if (result.status) setSync(result.status);
      if (!response.ok || !result.ok) throw new Error(result.error || "Couldn't update mileage. Try again.");
      setSyncMessage(result.busy ? "An update is already running. This sheet will refresh when it finishes."
        : result.cooldown ? "Mileage was just checked. Wait one minute before requesting another report." : "");
      await load();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Couldn't update mileage. Try again.");
    } finally { setSyncing(false); }
  }

  const active = useMemo(() => buses.filter(isPmFleetBus), [buses]);
  const work = useMemo(() => pmWorkItems(
    active.map((b) => records[b.num] || emptyPmRecord(b.num)), settings,
  ), [active, records, settings]);
  const rows = useMemo(() => filterPmWorkItems(work, filter, query, active, label), [work, query, filter, active, label]);
  const groups = useMemo(() => groupPmWorkItems(rows), [rows]);

  const counts = useMemo(() => {
    const c: Record<PmStatus, number> = { overdue: 0, "due-soon": 0, ok: 0, unknown: 0 };
    for (const item of work) c[item.status] += 1;
    return c;
  }, [work]);

  async function save(bus: string, field: EditableField, raw: string) {
    loadVersion.current += 1;
    markSave("saving");
    setSaveError("");
    if (field === "disposition") setSavingStatus((cur) => new Set(cur).add(bus));
    const value = MILES_FIELDS.has(field) ? toMiles(raw) : raw;
    try {
      const r = await fetch("/api/pm-mileage", {
        method: field === "disposition" ? "PATCH" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bus, [field]: field === "disposition" ? value : value === "" ? null : value, actor: getDeviceActor() }),
      });
      if (r.status === 401) throw new Error("Admin Tools are locked");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.record) setRecords((cur) => ({ ...cur, [bus]: d.record }));
      if (d.flagEntry !== undefined) setFlags((cur) => {
        const next = { ...cur };
        if (d.flagEntry) next[bus] = d.flagEntry;
        else delete next[bus];
        return next;
      });
      markSave("saved");
    } catch (err) {
      markSave("error");
      setSaveError(`Bus ${bus} didn't save (${err instanceof Error ? err.message : "error"}). Try again.`);
    } finally {
      if (field === "disposition") setSavingStatus((cur) => { const next = new Set(cur); next.delete(bus); return next; });
    }
  }

  const completingRecord = completing ? records[completing.bus] || emptyPmRecord(completing.bus) : null;

  return (
    <>
    <AppPage className={styles.page}>
      <PageHeader
        eyebrow="Preventive Maintenance"
        title="PM Mileage"
        description="Shop and Follow up buses appear first. Bus status also shows Split and Holds for Inspection. All other PMs stay in mileage order. Each PM keeps its own row."
        actions={
          <div className={styles.headerActions}>
            <SaveStatus state={saveState} />
            <AdminLogoutButton />
            {view === "upcoming" && <Button variant="secondary" isDisabled={!loaded || !fleetReady || !!loadError || saveState === "saving" || savingStatus.size > 0}
              onPress={() => { void openSheetPdf({ path: "/pm-mileage", params: { pmFilter: filter, pmQuery: query } }); }}>
              <FileDown aria-hidden="true" /> Print PDF
            </Button>}
            {autoSync && <Button variant="secondary" isDisabled={syncing || saveState === "saving"} onPress={updateMileageNow}>
              <RefreshCw aria-hidden="true" /> {syncing ? "Updating mileage…" : "Update mileage now"}
            </Button>}
            <Button variant="secondary" isDisabled={forcing || saveState === "saving"} onPress={() => { void forceUpdate(); }}>
              <RefreshCw aria-hidden="true" /> {forcing ? "Updating…" : "Force Update"}
            </Button>
            <Button variant="secondary" onPress={() => setTrackerOpen(true)}>
              <Copy aria-hidden="true" /> Copy odometers
            </Button>
            <Button variant="primary" onPress={() => setImportOpen(true)}>
              <FileUp aria-hidden="true" /> Import PDF
            </Button>
            {!unlocked && <AdminUnlockButton label="Unlock to edit" onSubmit={tryUnlock} />}
          </div>
        }
      />

      {/* Automatic Fleetwatch updates are switched off unless the server says
          otherwise (FLEETWATCH_AUTO_SYNC=on). Off, mileage comes from Import PDF. */}
      {!autoSync && (
        <div className={styles.syncNotice} role="status" aria-live="polite">
          <span><strong>Mileage source</strong> · <strong>Force Update</strong> fetches Fleetwatch&apos;s current Vehicle List Report, or upload a report with <strong>Import PDF</strong> (Admin Tools). Automatic updates are turned off.</span>
          {sync.lastSuccessAt && <span>Last update from Fleetwatch: {new Date(sync.lastSuccessAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
            {` · ${sync.updated ?? 0} updated · ${sync.unchanged ?? 0} unchanged`}</span>}
          {sync.runningUntil && Date.parse(sync.runningUntil) > Date.now() && <span>Fetching the latest report…</span>}
          {forceMessage && <span className={forceMessage.startsWith("Force Update done") ? undefined : styles.syncWarning}>{forceMessage}</span>}
          {!forceMessage && sync.error && <span className={styles.syncWarning}>{sync.error}</span>}
          {!!sync.skipped?.length && <div>
            <Button variant="quiet" aria-expanded={showSyncSkipped} aria-controls="mileage-sync-skipped" onPress={() => setShowSyncSkipped((value) => !value)}>{sync.skipped.length} readings skipped</Button>
            {showSyncSkipped && <ul id="mileage-sync-skipped">{sync.skipped.map((entry) => <li key={`${entry.bus}:${entry.reason}`}>Bus {entry.bus}: {entry.reason}</li>)}</ul>}
          </div>}
        </div>
      )}
      {autoSync && <div className={styles.syncNotice} role="status" aria-live="polite">
        <span><strong>Fleetwatch mileage</strong> · Previous 24 hours · Scheduled every 30 minutes</span>
        {sync.lastSuccessAt ? <span>Last successful check: {new Date(sync.lastSuccessAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
          {` · Mileage: ${sync.updated ?? 0} updated · ${sync.unchanged ?? 0} unchanged${sync.serviceUpdated !== undefined ? ` · Service times: ${sync.serviceUpdated} updated` : ""}`}</span>
          : <span>No successful check yet. Use Update mileage now to fetch the latest report.</span>}
        {sync.runningUntil && Date.parse(sync.runningUntil) > Date.now() && <span>Fetching the latest report…</span>}
        {forceMessage && <span className={forceMessage.startsWith("Force Update done") ? undefined : styles.syncWarning}>{forceMessage}</span>}
        {(syncMessage || sync.error) && <span className={styles.syncWarning}>{syncMessage || sync.error}</span>}
        {sync.serviceError && <span className={styles.syncWarning}>{sync.serviceError}</span>}
        {!!sync.skipped?.length && <div>
          <Button variant="quiet" aria-expanded={showSyncSkipped} aria-controls="mileage-sync-skipped" onPress={() => setShowSyncSkipped((value) => !value)}>{sync.skipped.length} readings skipped</Button>
          {showSyncSkipped && <ul id="mileage-sync-skipped">{sync.skipped.map((entry) => <li key={`${entry.bus}:${entry.reason}`}>Bus {entry.bus}: {entry.reason}</li>)}</ul>}
        </div>}
      </div>}

      {!unlocked && (
        <div className={styles.lockNotice}>
          <Lock aria-hidden="true" /> Anyone can complete PMs, undo accidental completions, update bus status, or force a mileage update from Fleetwatch. Unlock Admin Tools to edit mileage, schedules, or notes, or import reports.
        </div>
      )}

      <TabBar className={styles.viewTabs} label="PM view" selectedKey={view}
        onSelectionChange={(key) => setView(key as "upcoming" | "completed")}
        items={[{ id: "upcoming", label: "Upcoming" }, { id: "completed", label: "Completed" }]} />

      {view === "upcoming" && <div className={styles.tiles} role="group" aria-label="PM work counts and filters">
        {(["overdue", "due-soon", "ok", "unknown"] as PmStatus[]).map((status) => (
          <Pressable
            aria-pressed={filter === status}
            key={status}
            className={styles.tile}
            data-tone={TONE[status]}
            data-active={filter === status || undefined}
            onPress={() => setFilter((cur) => (cur === status ? "all" : status))}
          >
            <strong>{counts[status]}</strong>
            <span>{PM_STATUS_LABEL[status]}</span>
          </Pressable>
        ))}
        <div className={styles.tileNote}>
          Inspections every <strong>3,000</strong> mi · trans PM every <strong>{formatMiles(TRANS_PM_INTERVAL)}</strong> mi
          · due soon within <strong>{formatMiles(settings.dueSoonMiles)}</strong> mi
        </div>
      </div>}

      {(loadError || saveError) && (
        <div className={styles.errorBanner} role="alert">
          <AlertTriangle aria-hidden="true" /> {loadError || saveError}
        </div>
      )}

      {view === "completed" ? <PmCompletionHistory buses={active} records={records} label={label}
        onUpdated={(record) => {
          ++loadVersion.current;
          setRecords((cur) => ({ ...cur, [record.bus]: record }));
          void load();
        }} /> : <Panel className={styles.panel} title="Upcoming work" description={`${rows.length} of ${work.length} PMs · ${active.length} active buses · Service / odometer reading times are shown in Chicago time`}>
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
          <EmptyState title="No PMs match" description="Try another filter or search." />
        ) : (
          <div className={styles.table} role="table" aria-label="Upcoming PM work">
            <div className={`${styles.row} ${styles.head}`} role="row">
              <span role="columnheader">Bus</span>
              <span role="columnheader">Odometer</span>
              <span role="columnheader">Last serviced / last odometer reading time</span>
              <span role="columnheader">Next PM</span>
              <span role="columnheader">Miles left</span>
              <span role="columnheader">Bus status</span>
              <span role="columnheader">Note</span>
              <span role="columnheader">Actions</span>
            </div>
            {groups.map((group) => (
              <div role="rowgroup" aria-label={group.title} key={group.id}>
                <div className={styles.groupHeading} role="row">
                  <div role="cell" aria-colspan={8}><strong>{group.title}</strong><span>{group.items.length} PMs</span></div>
                </div>
            {group.items.map((item) => {
              const r = item.record;
              const disposition = pmDisplayDisposition(r, flags[r.bus]);
              const serviceTime = serviceTimeParts(r.lastServiceAt);
              const bus = active.find((b) => b.num === r.bus);
              const flagged = item.kind === "inspection" ? flaggedInspection(flags, r.bus) : null;
              const workLabel = item.kind === "trans" ? "Trans PM" : item.type ?? flagged ?? "Inspection";
              return (
                <div className={styles.row} role="row" key={item.id} data-status={item.status} aria-label={`Bus ${r.bus} ${workLabel}`}>
                  <div className={styles.busCell} role="cell">
                    <strong>{label(r.bus)}</strong>
                    <span className={styles.model}>
                      <TypeCodes num={r.bus} variant="ui" />
                      {bus?.model ? <span>{bus.model}</span> : null}
                    </span>
                  </div>
                  <div role="cell" data-label="Odometer">
                    <Cell readOnly={!unlocked} label={`Bus ${r.bus} ${workLabel} odometer`} numeric
                      value={r.odometer === null ? "" : String(r.odometer)} display={formatTenths(r.odometer)}
                      placeholder="miles" onCommit={(v) => save(r.bus, "odometer", v)} />
                    {unlocked ? <Cell label={`Bus ${r.bus} ${workLabel} reading date`} value={r.odometerDate || ""}
                      placeholder="reading date" onCommit={(v) => save(r.bus, "odometerDate", v)} />
                      : !serviceTime && r.odometerDate ? <span className={styles.readingDate}>As of {r.odometerDate}</span> : null}
                  </div>
                  <div role="cell" data-label="Last serviced / last odometer reading time" className={styles.serviceTime}>
                    {serviceTime ? <>
                      <time dateTime={r.lastServiceAt!}><span>{serviceTime.date}</span><span>{serviceTime.time}</span></time>
                      {r.lastServiceMiles !== null && r.lastServiceMiles !== r.odometer && <span className={styles.muted}>at {formatTenths(r.lastServiceMiles)} mi</span>}
                    </> : <span className={styles.muted}>Not recorded</span>}
                  </div>
                  <div role="cell" data-label="Next PM" className={styles.derived}>
                    <div className={styles.nextCell}>
                      <strong>{workLabel}</strong>
                      <span className={item.dueMiles === null ? styles.muted : undefined}>
                        {item.dueMiles === null ? "No due mileage" : `at ${formatTenths(item.dueMiles)}`}
                      </span>
                    </div>
                  </div>
                  <div role="cell" data-label="Miles left" className={styles.derived}>
                    <StatusBadge className={styles.mileageBadge} tone={TONE[item.status]} size="sm">{milesLeftLabel(item.milesLeft)}</StatusBadge>
                  </div>
                  <div role="cell" data-label="Bus status" data-disposition={disposition || undefined}>
                    <SelectField className={styles.typeSelect} label={`Bus ${r.bus} ${workLabel} status`} labelHidden
                      selectedKey={disposition} isDisabled={savingStatus.has(r.bus)}
                      onSelectionChange={(key) => save(r.bus, "disposition", String(key ?? ""))} options={DISPOSITION_OPTIONS} />
                  </div>
                  <div role="cell" data-label="Note">
                    {item.kind === "trans" && <div className={styles.standardNote}>{TRANS_PM_NOTE}</div>}
                    {(unlocked || r.note || item.kind !== "trans") && (
                      <Cell readOnly={!unlocked} label={`Bus ${r.bus} ${workLabel} note`}
                        value={r.note || ""} placeholder={item.kind === "trans" ? "Additional bus note" : "note"}
                        onCommit={(v) => save(r.bus, "note", v)} />
                    )}
                  </div>
                  <div role="cell" data-label="Actions" className={styles.actionCell}>
                    {!unlocked ? <Button size="sm" onPress={() => setCompleting({ bus: r.bus, kind: item.kind })} isDisabled={item.dueMiles === null}>Complete</Button> : (
                      <ActionMenu label="Actions" buttonSize="sm" placement="bottom end"
                        items={[
                          { id: "complete", label: `Complete ${workLabel}`, description: "Record this PM as done" },
                          { id: "next", label: item.kind === "inspection" ? "Edit next inspection…" : "Edit next trans PM…", description: "Set the type and due mileage directly" },
                          { id: "last", label: item.kind === "inspection" ? "Edit last inspection…" : "Edit last trans PM…", description: "Correct the completed PM on record" },
                          ...(item.kind === "inspection" && transNextDue(r) === null ? [
                            { id: "setup-trans", label: "Set next trans PM…", description: "Add its due mileage to the PM queue" },
                          ] : []),
                        ]}
                        onAction={(key) => {
                          const target = { bus: r.bus, kind: item.kind };
                          if (key === "next") setEditingNext(target);
                          else if (key === "setup-trans") setEditingNext({ bus: r.bus, kind: "trans" });
                          else if (key === "last") setEditing(target);
                          else setCompleting(target);
                        }} />
                    )}
                  </div>
                </div>
              );
            })}
              </div>
            ))}
          </div>
        )}
      </Panel>}

      <ImportDialog
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        unlocked={unlocked}
        tryUnlock={tryUnlock}
        onApplied={load}
      />
      <TrackerCopyDialog isOpen={trackerOpen} onOpenChange={setTrackerOpen} records={records} fleet={buses} />
      {unlocked && editing && (
        <EditInspectionDialog
          record={records[editing.bus] || emptyPmRecord(editing.bus)}
          kind={editing.kind}
          busLabel={label(editing.bus)}
          onClose={() => setEditing(null)}
          onSaved={(record) => {
            setRecords((cur) => ({ ...cur, [record.bus]: record }));
            setEditing(null);
          }}
        />
      )}
      {unlocked && editingNext && (
        <EditNextPmDialog
          record={records[editingNext.bus] || emptyPmRecord(editingNext.bus)}
          kind={editingNext.kind}
          busLabel={label(editingNext.bus)}
          onClose={() => setEditingNext(null)}
          onSaved={(record) => {
            setRecords((cur) => ({ ...cur, [record.bus]: record }));
            setEditingNext(null);
          }}
        />
      )}
      {completing && completingRecord && (
        <CompleteDialog
          admin={unlocked}
          target={completing}
          record={completingRecord}
          busLabel={label(completing.bus)}
          flaggedType={flaggedInspection(flags, completing.bus)}
          hasFlag={hasInspectionFlag(flags, completing.bus)}
          onClose={() => setCompleting(null)}
          onDone={(record, flagCleared) => {
            ++loadVersion.current;
            setRecords((cur) => ({ ...cur, [record.bus]: record }));
            if (flagCleared) {
              setFlags((cur) => {
                const entry = cur[record.bus];
                if (!entry) return cur;
                return {
                  ...cur,
                  [record.bus]: { ...removeInspection(entry), inspMiles: null },
                };
              });
            }
            setCompleting(null);
          }}
        />
      )}
    </AppPage>
    {loaded && fleetReady && !loadError && (
      <div className={styles.printOnly}>
        <PmMileagePaper items={rows} labels={Object.fromEntries(active.map((bus) => [bus.num, label(bus.num)]))}
          settings={settings} date={chicagoDateShort()} filter={filter} query={query} />
      </div>
    )}
    </>
  );
}

// ---------- Correct the next PM without requiring a completed one ----------
function EditNextPmDialog({ record, kind, busLabel, onClose, onSaved }: {
  record: PmRecord;
  kind: PmKind;
  busLabel: string;
  onClose: () => void;
  onSaved: (record: PmRecord) => void;
}) {
  const isInspection = kind === "inspection";
  const next = nextInspection(record);
  const due = isInspection ? next?.miles ?? null : transNextDue(record);
  const [type, setType] = useState<string>(next?.type ?? "");
  const [miles, setMiles] = useState(due === null ? "" : String(due));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const dueMiles = toMiles(miles);
    if (dueMiles === null || dueMiles > 2_147_483_647 || (isInspection && !isInspectionType(type))) {
      setError(isInspection ? "Choose the next inspection and enter its due mileage." : "Enter the transmission PM due mileage.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pm-mileage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bus: record.bus,
          ...(isInspection ? { nextInspType: type, nextInspMiles: dueMiles } : { nextTransMiles: dueMiles }),
          actor: getDeviceActor(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Admin Tools are locked — unlock and try again.");
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      onSaved(data.record as PmRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the next PM.");
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog isOpen onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Next ${isInspection ? "inspection" : "trans PM"} · Bus ${busLabel}`}
      description="Enter the work that is due and its odometer mileage. You do not need a last-PM record."
      size="sm"
      footer={<div className={styles.dialogFooter}>
        <Button variant="quiet" onPress={onClose} isDisabled={busy}>Cancel</Button>
        <Button variant="primary" onPress={submit} isDisabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>}
    >
      <div className={styles.settingsBody}>
        {isInspection && <SelectField label="Next inspection" selectedKey={type}
          onSelectionChange={(key) => setType(String(key ?? ""))} options={TYPE_OPTIONS.filter((option) => option.id !== "")} />}
        <TextField label="Due at (miles)" inputMode="numeric" value={miles} onChange={setMiles} placeholder="Odometer when due" />
        {error && <div className={styles.errorBanner} role="alert"><AlertTriangle aria-hidden="true" /> {error}</div>}
      </div>
    </ResponsiveDialog>
  );
}

// ---------- Edit the last inspection on record ----------
// The last inspection isn't a column any more (the next one is what the crew
// reads), but it is what the next one is computed from, so admins can still
// correct it here.
function EditInspectionDialog({
  record,
  kind,
  busLabel,
  onClose,
  onSaved,
}: {
  record: PmRecord;
  kind: PmKind;
  busLabel: string;
  onClose: () => void;
  onSaved: (record: PmRecord) => void;
}) {
  const isInspection = kind === "inspection";
  const lastMiles = isInspection ? record.lastInspMiles : record.lastTransMiles;
  const [type, setType] = useState<string>(record.lastInspType ?? "");
  const [miles, setMiles] = useState(lastMiles === null ? "" : String(lastMiles));
  const [date, setDate] = useState((isInspection ? record.lastInspDate : record.lastTransDate) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const milesValue = toMiles(miles);
  const preview = isInspection && isInspectionType(type) && milesValue !== null ? nextInspection({ ...record, lastInspType: type, lastInspMiles: milesValue, nextInspType: null, nextInspMiles: null }) : null;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pm-mileage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bus: record.bus,
          ...(isInspection ? {
            lastInspType: isInspectionType(type) ? type : null,
            lastInspMiles: milesValue, lastInspDate: date.trim() || null,
          } : { lastTransMiles: milesValue, lastTransDate: date.trim() || null }),
          actor: getDeviceActor(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("Admin Tools are locked — unlock and try again.");
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved(d.record as PmRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Last ${isInspection ? "inspection" : "trans PM"} · Bus ${busLabel}`}
      description="Correct the completed PM on record. Saving replaces any directly entered next-due schedule for this kind of PM with the schedule calculated from this record."
      size="sm"
      footer={
        <div className={styles.dialogFooter}>
          <Button variant="quiet" onPress={onClose} isDisabled={busy}>Cancel</Button>
          <Button variant="primary" onPress={submit} isDisabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className={styles.settingsBody}>
        {isInspection && <SelectField label="Inspection" selectedKey={type} onSelectionChange={(key) => setType(String(key ?? ""))} options={TYPE_OPTIONS} />}
        <TextField label="Recorded at (miles)" inputMode="numeric" value={miles} onChange={setMiles} placeholder="miles" />
        <TextField label="Date" value={date} onChange={setDate} placeholder="mm/dd/yy" />
        {preview && (
          <div className={styles.preview}>
            Next inspection {preview.type} at <strong>{formatTenths(preview.miles)}</strong>
          </div>
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

// ---------- Complete a PM ----------
function CompleteDialog({
  admin,
  target,
  record,
  busLabel,
  flaggedType,
  hasFlag,
  onClose,
  onDone,
}: {
  admin: boolean;
  target: CompleteTarget;
  record: PmRecord;
  busLabel: string;
  flaggedType: InspectionType | null;
  hasFlag: boolean;
  onClose: () => void;
  onDone: (record: PmRecord, flagCleared: boolean) => void;
}) {
  const isInspection = target.kind === "inspection";
  const next = nextInspection(record);
  const [type, setType] = useState<string>(next?.type ?? flaggedType ?? "");
  const [completedAt] = useState(() => new Date().toISOString());
  const [requestId] = useState(() => crypto.randomUUID());
  const [expectedSchedule] = useState(() => pmScheduleToken(record, target.kind));
  const [clearFlag, setClearFlag] = useState(hasFlag);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Nobody types an odometer here: the reading on file stands until the next
  // Force Update, and the PM is recorded at the mark it was due. The baseline
  // only matters for a first PM with no due mark yet.
  const baseline = record.odometer ?? (isInspection ? next?.miles ?? null : transNextDue(record));
  const after = useMemo(() => {
    if (baseline === null) return null;
    if (!isInspection) {
      const recordedAt = completionRecordedAt(record, "trans", null, baseline);
      return { label: "Next trans PM", at: recordedAt + TRANS_PM_INTERVAL, recordedAt };
    }
    if (!isInspectionType(type)) return null;
    const recordedAt = completionRecordedAt(record, "inspection", type, baseline);
    const preview = nextInspection({ ...record, lastInspType: type, lastInspMiles: recordedAt, nextInspType: null, nextInspMiles: null });
    return preview ? { label: `Next inspection ${preview.type}`, at: preview.miles, recordedAt } : null;
  }, [isInspection, type, baseline, record]);
  const milesLeftAfter = after && record.odometer !== null ? after.at - record.odometer : null;

  async function submit() {
    if (isInspection && !isInspectionType(type)) {
      setError("Pick which inspection was done.");
      return;
    }
    if (!after) {
      setError("This bus has no odometer or due mileage on file yet. Ask an admin to enter one first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pm-mileage/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bus: target.bus,
          kind: target.kind,
          type: isInspection ? type : null,
          completedAt,
          requestId,
          expectedSchedule,
          clearFlag: isInspection && hasFlag && clearFlag,
          actor: getDeviceActor(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("Admin Tools are locked — unlock and try again.");
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onDone(d.record as PmRecord, Boolean(d.flagCleared));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete the PM.");
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={isInspection ? `Complete inspection · Bus ${busLabel}` : `Complete trans PM · Bus ${busLabel}`}
      description={
        isInspection
          ? "Confirms the inspection was done today. It is recorded at the mileage it was due, so the next one lands 3,000 miles after that mark. The odometer is not changed here; Force Update keeps it current."
          : `Confirms the transmission PM was done today. It is recorded at the mileage it was due; the next one is ${formatMiles(TRANS_PM_INTERVAL)} miles after that mark. The odometer is not changed here.`
      }
      size="sm"
      footer={
        <div className={styles.dialogFooter}>
          <Button variant="quiet" onPress={onClose} isDisabled={busy}>Cancel</Button>
          <Button variant="primary" onPress={submit} isDisabled={busy || !after}>
            {busy ? "Saving…" : "Confirm"}
          </Button>
        </div>
      }
    >
      <div className={styles.settingsBody}>
        {isInspection && (admin ? (
          <SelectField
            label="Inspection done"
            description={
              next
                ? `${next.type} was next for this bus.`
                : flaggedType
                  ? `The sheet flags this bus for ${flaggedType}.`
                  : "No inspection on record yet — pick the one that was done."
            }
            selectedKey={type}
            onSelectionChange={(key) => setType(String(key ?? ""))}
            options={TYPE_OPTIONS.filter((o) => o.id !== "")}
          />
        ) : <TextField label="Inspection done" value={type} isReadOnly />)}
        <TextField label="Date" value={chicagoDateShort(new Date(completedAt))} isReadOnly />
        <TextField label="Time (Chicago)" value={new Date(completedAt).toLocaleTimeString("en-US", { timeZone: "America/Chicago" })} isReadOnly />
        {hasFlag && isInspection && (
          <Checkbox isSelected={clearFlag} onChange={setClearFlag}>
            Also clear the Inspection flag on the sheet
          </Checkbox>
        )}
        {after ? (
          <div className={styles.preview}>
            <div>{isInspection ? `${type} recorded at` : "Trans PM recorded at"} <strong>{formatTenths(after.recordedAt)}</strong></div>
            <div>
              {after.label} at <strong>{formatTenths(after.at)}</strong>
              {milesLeftAfter !== null ? <> · <strong>{formatTenths(milesLeftAfter)}</strong> miles from now</> : null}
            </div>
            <div>
              Odometer stays at <strong>{record.odometer === null ? "no reading on file" : formatTenths(record.odometer)}</strong> until the next Force Update.
            </div>
          </div>
        ) : (
          <div className={styles.notice}>This bus has no odometer or due mileage on file yet, so the next mark cannot be worked out. Ask an admin to enter one first.</div>
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

// ---------- Import PDF ----------
interface ImportResult {
  accepted: PmReadingReview[];
  rejected: PmReadingRejection[];
  reportDate: string | null;
  notes: string | null;
  method: "text" | "ai";
  format: "pm-status" | "monthly-miles" | "vehicle-list" | "tracker" | "ai";
  missingFromTracker?: string[];
  model: string | null;
  fileName: string;
  rawCount: number;
}

// The shop's hand-kept tracker workbook only needs new numbers in its
// Current Odometer column. Paste its Bus # column in, copy the odometers out
// in the same order, paste them over the column. Nothing is uploaded.
function TrackerCopyDialog({
  isOpen,
  onOpenChange,
  records,
  fleet,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  records: Record<string, PmRecord>;
  fleet: Pick<MasterBus, "num" | "status">[];
}) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState<"column" | "table" | "">("");
  const [copyError, setCopyError] = useState("");
  useEffect(() => {
    if (!isOpen) { setInput(""); setCopied(""); setCopyError(""); }
  }, [isOpen]);
  const paste = useMemo(() => odometerLinesFor(input, records), [input, records]);
  const output = paste.lines.join("\n");

  async function copy(text: string, which: "column" | "table") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setCopyError("");
    } catch {
      setCopyError("Couldn't reach the clipboard. Select the odometers in the box and copy them with Ctrl+C.");
    }
  }

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Copy odometers for the tracker"
      description="In your tracker, copy the Bus # column from the first bus down and paste it here. The odometers come back in the same order: click the first Current Odometer cell and paste. Nothing else in the workbook changes."
      size="lg"
      footer={
        <div className={styles.dialogFooter}>
          <Button variant="primary" isDisabled={paste.matched === 0} onPress={() => { void copy(output, "column"); }}>
            <Copy aria-hidden="true" /> {copied === "column" ? "Copied" : "Copy odometers"}
          </Button>
        </div>
      }
    >
      <div className={styles.importBody}>
        <label className={styles.pasteBox}>
          <span>Bus numbers from your sheet</span>
          <textarea rows={8} value={input} spellCheck={false} placeholder={"6416\n6456\n6440"} aria-label="Bus numbers from your sheet"
            onChange={(event) => { setInput(event.target.value); setCopied(""); }} />
        </label>
        <label className={styles.pasteBox}>
          <span>Odometers, same order</span>
          <textarea rows={8} value={output} readOnly spellCheck={false} placeholder="The odometers appear here" aria-label="Odometers, same order" />
          <span className={styles.fileHint}>
            {paste.buses === 0
              ? "Paste bus numbers to get started. Tip: format the Current Odometer column as 0.0 once so whole numbers keep their .0."
              : `${paste.matched} of ${paste.buses} bus${paste.buses === 1 ? "" : "es"} matched · one line per pasted line, so the paste lands on the right rows.`}
          </span>
        </label>
        {paste.unmatched.length > 0 && (
          <div className={styles.notice}>Not on PM Mileage, left blank: {paste.unmatched.join(", ")}</div>
        )}
        {paste.skipped.length > 0 && (
          <div className={styles.notice}>Not bus numbers, left blank: {paste.skipped.join(", ")}. Copy from the first bus, not the header.</div>
        )}
        <details className={styles.reviewSummary}>
          <summary>Other ways</summary>
          <p>
            <Button variant="secondary" onPress={() => { void copy(odometerTable(records, fleet), "table"); }}>
              <Copy aria-hidden="true" /> {copied === "table" ? "Copied" : "Copy every bus and odometer"}
            </Button>
            {" "}Two columns, bus and odometer, for a lookup tab when a sheet is in another order.
          </p>
          <p>
            <a href="/api/pm-mileage/tracker">Download a fresh tracker workbook</a> built from this page, with both sheets and live formulas.
          </p>
        </details>
        {copyError && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle aria-hidden="true" /> {copyError}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
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
  const [autoCompleted, setAutoCompleted] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setBusy(false);
      setError("");
      setResult(null);
      setPicked(new Set());
      setDone(null);
      setAutoCompleted(0);
    }
  }, [isOpen]);

  async function scan() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      // The browser reads the PDF's text layer and sends just that: the scans
      // run to several megabytes, more than the server will take in one
      // request. If the browser can't read it, a small file is uploaded whole.
      let r: Response;
      const isWorkbook = /\.xlsx$/i.test(file.name);
      try {
        if (isWorkbook) throw new Error("workbook"); // the tracker is small and read on the server
        const pages = await readPdfTextInBrowser(file);
        r = await fetch("/api/pm-mileage/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, pages }),
        });
      } catch (readErr) {
        if (!isWorkbook && file.size > 4 * 1024 * 1024) {
          throw new Error(
            `Couldn't read this PDF in the browser (${readErr instanceof Error ? readErr.message : "error"}) and it is too big to upload whole.`,
          );
        }
        const body = new FormData();
        body.append("file", file);
        r = await fetch("/api/pm-mileage/import", { method: "POST", body });
      }
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error("Admin Tools are locked — unlock and try again.");
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      // Everything is selected, warnings included: the sheets come in daily,
      // so a reading that looks off is corrected by the next one.
      setPicked(new Set((d.accepted as PmReadingReview[]).map((x) => x.bus)));
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
      .map((x) => ({
        bus: x.bus,
        odometer: x.odometer,
        scheduleOnly: x.scheduleOnly === true,
        readAt: x.readAt,
        nextInspType: x.nextInspType ?? null,
        nextInspDue: x.nextInspDue ?? null,
        transDue: x.transDue ?? null,
        lastInspType: x.lastInspType ?? null,
        lastInspMiles: x.lastInspMiles ?? null,
        lastTransMiles: x.lastTransMiles ?? null,
      }));
    if (!readings.length) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pm-mileage/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings, source: result.format === "tracker" ? "tracker" : "pdf", actor: getDeviceActor() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDone(d.applied?.length ?? readings.length);
      setAutoCompleted(typeof d.autoCompleted === "number" ? d.autoCompleted : 0);
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
      title="Import a fleet report"
      description="Upload the PM status report (inspections due), the monthly miles report, the vehicle list report (odometers), or the PNW tracker workbook (next inspection and trans PM per bus; odometers stay as they are). What it says about each bus is listed for review before anything changes."
      size="lg"
      footer={<div className={styles.dialogFooter}>{footer}</div>}
    >
      <div className={styles.importBody}>
        {!unlocked && (
          <div className={styles.notice}>
            Importing a report needs Admin Tools. <AdminUnlockButton label="Unlock" onSubmit={tryUnlock} />
          </div>
        )}
        {done !== null ? (
          <div className={styles.doneNote}>
            <Gauge aria-hidden="true" /> Saved {done} bus{done === 1 ? "" : "es"} from {result?.fileName}.
            {autoCompleted > 0 ? ` ${autoCompleted} PM${autoCompleted === 1 ? "" : "s"} auto-completed by master upload; see Completed.` : ""}
          </div>
        ) : !result ? (
          <label className={styles.filePick}>
            <span>Report PDF or tracker workbook</span>
            <span className={styles.fileHint}>
              Total Fleet PM Status Report, Vehicles Monthly Miles to Date Report, or Vehicle List Report. The PDF&apos;s own text is read
              directly — no AI, no cost. Picture-only scans need the AI reader. The PNW DAILY P.M. TRACKER (.xlsx) sets the next inspection
              and trans PM per bus without touching odometers.
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              <span>
                {" · "}
                {result.format === "pm-status"
                  ? "PM status report, read from the PDF text"
                  : result.format === "monthly-miles"
                    ? "monthly miles report, read from the PDF text"
                    : result.format === "vehicle-list"
                      ? "vehicle list report, read from the PDF text"
                      : result.format === "tracker"
                        ? "PNW tracker workbook: PM schedule only"
                        : `read by AI (${result.model || "model"})`}
              </span>
              {result.notes ? <p>{result.notes}</p> : null}
              {result.format === "tracker" && (
                <p>
                  {result.accepted.filter((row) => row.nextInspType).length} next inspections and {result.accepted.filter((row) => row.transDue).length} trans PMs will be set from this file. Odometers are not changed.
                </p>
              )}
              {result.missingFromTracker && result.missingFromTracker.length > 0 && (
                <p>
                  <strong>Active on this page but not in the tracker:</strong> {result.missingFromTracker.join(", ")}
                </p>
              )}
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
                    <span className={styles.reviewMiles}>{formatTenths(row.odometer)}</span>
                    <span className={styles.reviewDelta}>
                      {row.scheduleOnly
                        ? row.odometer === null ? "no odometer on file" : "odometer kept"
                        : row.previous === null
                          ? "first reading"
                          : `${row.delta !== null && row.delta >= 0 ? "+" : ""}${formatMiles(row.delta)} from ${formatTenths(row.previous)}`}
                    </span>
                    <span className={styles.reviewPm}>
                      {row.nextInspType ? `next ${row.nextInspType} at ${formatTenths(row.nextInspDue)}` : ""}
                      {row.nextInspType && row.transDue ? " · " : ""}
                      {row.transDue ? `trans at ${formatTenths(row.transDue)}` : ""}
                      {!row.nextInspType && !row.transDue ? "mileage only" : ""}
                    </span>
                    {row.note ? <span className={styles.reviewNote}>{row.note}</span> : null}
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
                      <strong>{row.bus}</strong> {row.odometer !== null ? formatTenths(row.odometer) : ""} — {row.reason}
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

