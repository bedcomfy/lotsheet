"use client";

// PM Mileage: every active bus with its current odometer, the last inspection
// it had (type + mileage), the next one in the cycle and the mileage it is due
// at, plus the transmission PM on its own 75,000-mile interval. The intervals
// are fixed by the cycle and never edited here; "Complete" records a PM as
// done, which moves the bus to its next inspection and down the list.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Gauge, RefreshCw } from "lucide-react";
import { chicagoDateShort } from "../lib/chicagoTime";
import { getDeviceActor } from "../lib/deviceActor";
import { inspectionOptionFromText } from "../lib/grid";
import {
  DEFAULT_PM_SETTINGS,
  INSPECTION_CYCLE,
  PM_STATUS_LABEL,
  TRANS_PM_INTERVAL,
  emptyPmRecord,
  formatMiles,
  inspMilesRemaining,
  inspStatus,
  isInspectionType,
  nextInspection,
  pmStatus,
  sortPmRecords,
  toMiles,
  transMilesRemaining,
  transNextDue,
  transStatus,
  type InspectionType,
  type PmKind,
  type PmReadingRejection,
  type PmReadingReview,
  type PmRecord,
  type PmSettings,
  type PmStatus,
} from "../lib/pmMileage";
import type { FlagMap } from "../lib/types";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import {
  ActionMenu,
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
type EditableField =
  | "odometer"
  | "odometerDate"
  | "lastInspType"
  | "lastInspMiles"
  | "lastInspDate"
  | "lastTransMiles"
  | "lastTransDate"
  | "note";
const MILES_FIELDS: ReadonlySet<EditableField> = new Set(["odometer", "lastInspMiles", "lastTransMiles"]);

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All buses" },
  { id: "overdue", label: "Overdue" },
  { id: "due-soon", label: "Due soon" },
  { id: "ok", label: "OK" },
  { id: "unknown", label: "No record" },
];

const TYPE_OPTIONS = [
  { id: "", label: "—" },
  ...INSPECTION_CYCLE.map((type) => ({ id: type, label: type })),
];

const TONE: Record<PmStatus, "danger" | "warning" | "success" | "neutral"> = {
  overdue: "danger",
  "due-soon": "warning",
  ok: "success",
  unknown: "neutral",
};

// "1,200" / "300 over" / "No record" for a miles-left figure.
function milesLeftLabel(left: number | null): string {
  if (left === null) return PM_STATUS_LABEL.unknown;
  return left < 0 ? `${formatMiles(-left)} over` : formatMiles(left);
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
  const [saveState, markSave] = useSaveState();
  const [saveError, setSaveError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [completing, setCompleting] = useState<CompleteTarget | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([
        fetch("/api/pm-mileage", { cache: "no-store" }),
        fetch("/api/flags", { cache: "no-store" }).catch(() => null),
      ]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRecords(d.records || {});
      setSettings(d.settings || DEFAULT_PM_SETTINGS);
      if (f && f.ok) {
        const fd = await f.json().catch(() => ({}));
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
    const value = MILES_FIELDS.has(field) ? toMiles(raw) : raw;
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

  const completingRecord = completing ? records[completing.bus] || emptyPmRecord(completing.bus) : null;

  return (
    <AppPage className={styles.page}>
      <PageHeader
        eyebrow="Preventive Maintenance"
        title="PM Mileage"
        description="Current mileage, the last inspection, and the miles left before the next one. Inspections run A-3 through C-24 every 3,000 miles; transmission PMs every 75,000. Mark a PM complete to move the bus to its next one."
        actions={
          <div className={styles.headerActions}>
            <SaveStatus state={saveState} />
            <Button variant="quiet" onPress={load} aria-label="Refresh">
              <RefreshCw aria-hidden="true" /> Refresh
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
          Inspections every <strong>3,000</strong> mi · trans PM every <strong>{formatMiles(TRANS_PM_INTERVAL)}</strong> mi
          · due soon within <strong>{formatMiles(settings.dueSoonMiles)}</strong> mi
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
              <span role="columnheader">Last inspection</span>
              <span role="columnheader">Next inspection</span>
              <span role="columnheader">Miles left</span>
              <span role="columnheader">Trans PM</span>
              <span role="columnheader">Trans left</span>
              <span role="columnheader">Done</span>
              <span role="columnheader">Note</span>
            </div>
            {rows.map((r) => {
              const status = pmStatus(r, settings);
              const next = nextInspection(r);
              const inspLeft = inspMilesRemaining(r);
              const transDue = transNextDue(r);
              const transLeft = transMilesRemaining(r);
              const bus = active.find((b) => b.num === r.bus);
              const flagged = flaggedInspection(flags, r.bus);
              const completeLabel = next ? `Complete ${next.type}` : flagged ? `Complete ${flagged}` : "Complete inspection";
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
                  <div role="cell" data-label="Last inspection" className={styles.stack}>
                    <div className={`${styles.stackRow} ${styles.typeRow}`}>
                      <SelectField
                        className={styles.typeSelect}
                        label={`Bus ${r.bus} last inspection type`}
                        labelHidden
                        selectedKey={r.lastInspType ?? ""}
                        onSelectionChange={(key) => save(r.bus, "lastInspType", String(key ?? ""))}
                        options={TYPE_OPTIONS}
                      />
                      <Cell
                        label={`Bus ${r.bus} last inspection mileage`}
                        numeric
                        value={r.lastInspMiles === null ? "" : String(r.lastInspMiles)}
                        display={formatMiles(r.lastInspMiles)}
                        placeholder="at miles"
                        onCommit={(v) => save(r.bus, "lastInspMiles", v)}
                      />
                    </div>
                    <Cell
                      label={`Bus ${r.bus} last inspection date`}
                      value={r.lastInspDate || ""}
                      placeholder="date"
                      onCommit={(v) => save(r.bus, "lastInspDate", v)}
                    />
                  </div>
                  <div role="cell" data-label="Next inspection" className={styles.derived}>
                    {next ? (
                      <div className={styles.nextCell}>
                        <strong>{next.type}</strong>
                        <span>at {formatMiles(next.miles)}</span>
                      </div>
                    ) : flagged ? (
                      <div className={styles.nextCell}>
                        <strong>{flagged}</strong>
                        <span className={styles.muted}>flagged · no mileage yet</span>
                      </div>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </div>
                  <div role="cell" data-label="Miles left" className={styles.derived}>
                    <StatusBadge tone={TONE[inspStatus(r, settings)]} size="sm">
                      {milesLeftLabel(inspLeft)}
                    </StatusBadge>
                  </div>
                  <div role="cell" data-label="Trans PM" className={styles.stack}>
                    <div className={styles.stackRow}>
                      <Cell
                        label={`Bus ${r.bus} last transmission PM mileage`}
                        numeric
                        value={r.lastTransMiles === null ? "" : String(r.lastTransMiles)}
                        display={formatMiles(r.lastTransMiles)}
                        placeholder="last at"
                        onCommit={(v) => save(r.bus, "lastTransMiles", v)}
                      />
                      <Cell
                        label={`Bus ${r.bus} last transmission PM date`}
                        value={r.lastTransDate || ""}
                        placeholder="date"
                        onCommit={(v) => save(r.bus, "lastTransDate", v)}
                      />
                    </div>
                    <span className={`${styles.derived} ${styles.subline}`}>
                      {transDue === null ? "next: —" : `next at ${formatMiles(transDue)}`}
                    </span>
                  </div>
                  <div role="cell" data-label="Trans left" className={styles.derived}>
                    <StatusBadge tone={TONE[transStatus(r, settings)]} size="sm">
                      {milesLeftLabel(transLeft)}
                    </StatusBadge>
                  </div>
                  <div role="cell" data-label="Done" className={styles.actionCell}>
                    <ActionMenu
                      label={
                        <>
                          <CheckCircle2 aria-hidden="true" /> Complete
                        </>
                      }
                      buttonSize="sm"
                      placement="bottom end"
                      items={[
                        { id: "inspection", label: completeLabel, description: "Moves the bus to its next inspection" },
                        { id: "trans", label: "Complete trans PM", description: `Next due ${formatMiles(TRANS_PM_INTERVAL)} mi later` },
                      ]}
                      onAction={(key) => setCompleting({ bus: r.bus, kind: key === "trans" ? "trans" : "inspection" })}
                    />
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
      {completing && completingRecord && (
        <CompleteDialog
          target={completing}
          record={completingRecord}
          busLabel={label(completing.bus)}
          flaggedType={flaggedInspection(flags, completing.bus)}
          hasFlag={hasInspectionFlag(flags, completing.bus)}
          onClose={() => setCompleting(null)}
          onDone={(record, flagCleared) => {
            setRecords((cur) => ({ ...cur, [record.bus]: record }));
            if (flagCleared) {
              setFlags((cur) => {
                const entry = cur[record.bus];
                if (!entry) return cur;
                return {
                  ...cur,
                  [record.bus]: { ...entry, flags: entry.flags.filter((id) => id !== "inspection"), inspOption: "" },
                };
              });
            }
            setCompleting(null);
          }}
        />
      )}
    </AppPage>
  );
}

// ---------- Complete a PM ----------
function CompleteDialog({
  target,
  record,
  busLabel,
  flaggedType,
  hasFlag,
  onClose,
  onDone,
}: {
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
  const [miles, setMiles] = useState(record.odometer === null ? "" : String(record.odometer));
  const [date, setDate] = useState(chicagoDateShort());
  const [clearFlag, setClearFlag] = useState(hasFlag);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const milesValue = toMiles(miles);
  const after = useMemo(() => {
    if (milesValue === null) return null;
    if (!isInspection) return { label: "Next trans PM", at: milesValue + TRANS_PM_INTERVAL };
    if (!isInspectionType(type)) return null;
    const preview = nextInspection({ ...record, lastInspType: type, lastInspMiles: milesValue });
    return preview ? { label: `Next inspection ${preview.type}`, at: preview.miles } : null;
  }, [isInspection, type, milesValue, record]);

  async function submit() {
    if (milesValue === null) {
      setError("Enter the odometer reading when the PM was done.");
      return;
    }
    if (isInspection && !isInspectionType(type)) {
      setError("Pick which inspection was done.");
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
          miles: milesValue,
          date: date.trim() || null,
          clearFlag: hasFlag && clearFlag,
          actor: getDeviceActor(),
        }),
      });
      const d = await r.json().catch(() => ({}));
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
          ? "Records the inspection as done at this mileage. The bus moves to the next inspection in the cycle, 3,000 miles on."
          : `Records the transmission PM as done at this mileage. The next one is due ${formatMiles(TRANS_PM_INTERVAL)} miles on.`
      }
      size="sm"
      footer={
        <div className={styles.dialogFooter}>
          <Button variant="quiet" onPress={onClose} isDisabled={busy}>Cancel</Button>
          <Button variant="primary" onPress={submit} isDisabled={busy}>
            {busy ? "Saving…" : "Mark complete"}
          </Button>
        </div>
      }
    >
      <div className={styles.settingsBody}>
        {isInspection && (
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
        )}
        <TextField label="Odometer when done" inputMode="numeric" value={miles} onChange={setMiles} placeholder="miles" />
        <TextField label="Date" value={date} onChange={setDate} placeholder="mm/dd/yy" />
        {hasFlag && isInspection && (
          <Checkbox isSelected={clearFlag} onChange={setClearFlag}>
            Also clear the Inspection flag on the sheet
          </Checkbox>
        )}
        {after && (
          <div className={styles.preview}>
            {after.label} at <strong>{formatMiles(after.at)}</strong>
            {record.odometer !== null && milesValue !== null && milesValue < record.odometer
              ? ` · odometer stays at ${formatMiles(record.odometer)}`
              : ""}
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

