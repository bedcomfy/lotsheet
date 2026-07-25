"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { Employee } from "../lib/types";
import { employeeFullName } from "../lib/types";
import { DAYS, STAFF_ROLES, type PickBreak, type PickRow, type PickShift, type WorkPick } from "../lib/staffing";
import { WORK_PICK_SEED } from "../lib/workPickSeed";
import { useEmployees, useWorkPick } from "../lib/queries";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import AdminUnlockButton from "./AdminUnlockButton";
import EmployeeInput from "./EmployeeInput";
import { SkeletonRows } from "./Skeleton";
import {
  Button,
  Chip,
  ConfirmDialog,
  IconButton,
  Panel,
  SearchField,
  SelectField,
  StatusBadge,
  TextField,
} from "../ui";
import styles from "./WorkPickPage.module.css";

const uid = () => Math.random().toString(36).slice(2, 9);

// "Fri, Sat" / "None" summary of a row's off days.
function offLabel(offDays: number[]): string {
  if (!offDays || offDays.length === 0) return "None";
  return [...offDays].sort((a, b) => a - b).map((d) => DAYS[d]?.short || "?").join(", ");
}

// ISO date → "M/D/YYYY".
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return iso || "—";
}

function blankShift(): PickShift {
  return { id: uid(), name: "New shift", start: "06:00", end: "14:30", rows: [], breaks: [] };
}
function blankRow(): PickRow {
  return { id: uid(), role: STAFF_ROLES[0], employeeId: "", name: "", offDays: [0, 6] };
}

export default function WorkPickPage() {
  const { unlocked, tryUnlock, lock } = useAdminUnlock();
  const [pick, setPick] = useState<WorkPick | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const shiftsRef = useRef<HTMLDivElement>(null);

  // Employees are read-only here (autocomplete + strike-through), so read them
  // straight from the shared live cache. The work pick, by contrast, seeds the
  // editable local draft exactly ONCE — a refetch/pulse must never clobber an
  // unsaved edit. Save re-PUTs the draft; Home picks it up via the live pulse.
  const { data: employees = [] } = useEmployees();
  const { data: pickData, isSuccess: pickLoaded, isError: pickFailed } = useWorkPick();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (pickLoaded) {
      setPick(pickData && Array.isArray(pickData.shifts) ? pickData : WORK_PICK_SEED);
      seededRef.current = true;
      setLoaded(true);
    } else if (pickFailed) {
      setPick(WORK_PICK_SEED);
      seededRef.current = true;
      setLoaded(true);
    }
  }, [pickLoaded, pickFailed, pickData]);

  // Bring the first highlighted spot into view when the search changes.
  useEffect(() => {
    if (!search.trim()) return;
    const el = shiftsRef.current?.querySelector('[data-work-pick-match="true"]');
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [search]);

  // Immutable pick editing helpers -----------------------------------------
  function edit(updater: (p: WorkPick) => WorkPick) {
    setSaved(false);
    setPick((p) => (p ? updater(structuredClone(p)) : p));
  }
  function editShift(si: number, updater: (s: PickShift) => void) {
    edit((p) => {
      updater(p.shifts[si]);
      return p;
    });
  }
  function setRowName(si: number, ri: number, value: string) {
    editShift(si, (s) => {
      const row = s.rows[ri];
      row.name = value;
      const match = employees.find((e) => employeeFullName(e).toLowerCase() === value.trim().toLowerCase());
      row.employeeId = match ? match.badge : "";
    });
  }
  function toggleOff(si: number, ri: number, day: number) {
    editShift(si, (s) => {
      const row = s.rows[ri];
      const set = new Set(row.offDays || []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      row.offDays = [...set].sort((a, b) => a - b);
    });
  }

  async function save() {
    if (!pick) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/state/workpick", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: pick }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setSaving(false);
    if (res && res.ok) setSaved(true);
  }
  function resetToSeed() {
    setSaved(false);
    setPick(structuredClone(WORK_PICK_SEED));
  }

  if (!loaded || !pick) {
    return (
      <Panel bodyClassName={styles.loading}>
        <SkeletonRows rows={5} />
      </Panel>
    );
  }

  // Badge -> reason for anyone currently out of service (time off, vacation…),
  // so the pick view can strike them through.
  const unavailableById = new Map<string, string>();
  const empById = new Map<string, Employee>();
  for (const e of employees) {
    const reason = (e.availability || "").trim();
    if (reason && e.badge) unavailableById.set(e.badge, reason);
    if (e.badge) empById.set(e.badge, e);
  }

  // Search doesn't filter the pick — it just highlights the matching person's
  // spot(s). Match the displayed name, the linked roster full name, or the badge.
  const q = search.trim().toLowerCase();
  const rowMatches = (row: PickRow): boolean => {
    if (!q) return false;
    const emp = row.employeeId ? empById.get(row.employeeId) : undefined;
    const full = emp ? employeeFullName(emp).toLowerCase() : "";
    return (
      (row.name || "").toLowerCase().includes(q) ||
      full.includes(q) ||
      (row.employeeId || "").toLowerCase().includes(q)
    );
  };
  const matchCount = q
    ? pick.shifts.reduce((n, s) => n + s.rows.filter(rowMatches).length, 0)
    : 0;

  return (
    <Panel
      className={styles.panel}
      bodyClassName={styles.body}
      title="Work Pick"
      description={
        unlocked
          ? "Editing the shared work pick. Home reads this schedule for Available Now."
          : `Effective ${fmtDate(pick.effective)}. Highlighted days are worked; OFF days are off.`
      }
      actions={
        unlocked ? (
          <>
            {saved && (
              <StatusBadge tone="success">
                <Check aria-hidden="true" /> Saved
              </StatusBadge>
            )}
            <Button onPress={lock}>
              <Lock aria-hidden="true" /> Done
            </Button>
            <Button onPress={() => setResetOpen(true)}>
              <RotateCcw aria-hidden="true" /> Reset
            </Button>
            <Button variant="primary" onPress={save} isDisabled={saving}>
              <Save aria-hidden="true" /> {saving ? "Saving..." : "Save pick"}
            </Button>
          </>
        ) : (
          <AdminUnlockButton onSubmit={tryUnlock} label="Edit pick" />
        )
      }
    >
      <div className={styles.controls}>
        <SearchField
          className={styles.search}
          label="Find an employee"
          labelHidden
          placeholder="Find an employee on the pick"
          value={search}
          onChange={setSearch}
          description={
            search
              ? `${matchCount} ${matchCount === 1 ? "match" : "matches"}`
              : "Highlights matching names and badge numbers"
          }
        />

      {unlocked && (
          <TextField
            className={styles.effective}
            label="Effective date"
            type="date"
            value={pick.effective}
            onChange={(value) =>
              edit((p) => {
                p.effective = value;
                return p;
              })
            }
          />
      )}
      </div>

      <div className={styles.shifts} ref={shiftsRef}>
        {pick.shifts.map((shift, si) => (
          <section className={styles.shift} key={shift.id}>
            <div className={styles.shiftHead}>
              {unlocked ? (
                <div className={styles.shiftEditHead}>
                  <TextField
                    className={styles.shiftName}
                    label="Shift name"
                    labelHidden
                    value={shift.name}
                    onChange={(value) => editShift(si, (s) => { s.name = value; })}
                  />
                  <span className={styles.shiftTimes}>
                    <TextField
                      className={styles.timeField}
                      label="Shift start"
                      labelHidden
                      type="time"
                      value={shift.start}
                      onChange={(value) => editShift(si, (s) => { s.start = value; })}
                    />
                    <span>–</span>
                    <TextField
                      className={styles.timeField}
                      label="Shift end"
                      labelHidden
                      type="time"
                      value={shift.end}
                      onChange={(value) => editShift(si, (s) => { s.end = value; })}
                    />
                  </span>
                  <IconButton
                    variant="danger"
                    aria-label={`Remove ${shift.name}`}
                    onPress={() => edit((p) => { p.shifts.splice(si, 1); return p; })}
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </div>
              ) : (
                <>
                  <h3>{shift.name}</h3>
                  <span className={styles.shiftTimes}>{shift.start} – {shift.end}</span>
                </>
              )}
            </div>

            {!unlocked ? (
              <div className={styles.pickTable} role="table">
                <div className={styles.tableHead} role="row">
                  <span className={styles.tableRole}>Role</span>
                  <span className={styles.tableName}>Employee</span>
                  {DAYS.map((d) => <span className={styles.pickDay} key={d.key}>{d.short}</span>)}
                  <span className={styles.tableOff}>Off days</span>
                </div>
                {shift.rows.length === 0 && <div className={styles.empty}>No one on this shift.</div>}
                {shift.rows.map((row) => {
                  const outReason = row.employeeId ? unavailableById.get(row.employeeId) : undefined;
                  return (
                  <div className={styles.tableRow} data-work-pick-match={rowMatches(row) || undefined} role="row" key={row.id}>
                    <span className={styles.tableRole} data-label="Role">{row.role}</span>
                    <span className={styles.tableName} data-label="Employee">
                      <span className={outReason ? styles.nameOut : undefined}>{row.name || "—"}</span>
                      {outReason && <StatusBadge tone="warning">{outReason}</StatusBadge>}
                    </span>
                    {DAYS.map((d, idx) => {
                      const off = (row.offDays || []).includes(idx);
                      return (
                        <span className={`${styles.pickDay} ${off ? styles.pickDayOff : styles.pickDayOn}`} key={d.key} title={`${d.long}: ${off ? "Off" : "Working"}`}>
                          {off ? "OFF" : "•"}
                        </span>
                      );
                    })}
                    <span className={styles.tableOff} data-label="Off days">{offLabel(row.offDays || [])}</span>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.pickEdit}>
                {shift.rows.map((row, ri) => (
                  <div className={styles.editRow} data-work-pick-match={rowMatches(row) || undefined} key={row.id}>
                    <SelectField
                      className={styles.editRole}
                      label="Role"
                      selectedKey={row.role}
                      options={[
                        ...STAFF_ROLES.map((role) => ({ id: role, label: role })),
                        ...(!STAFF_ROLES.includes(row.role) ? [{ id: row.role, label: row.role }] : []),
                      ]}
                      onSelectionChange={(key) => editShift(si, (s) => { s.rows[ri].role = String(key); })}
                    />
                    <EmployeeInput
                      className={styles.editName}
                      value={row.name}
                      employees={employees}
                      placeholder="Employee"
                      onChange={(v) => setRowName(si, ri, v)}
                    />
                    <div className={styles.editDays} role="group" aria-label="Working days">
                      {DAYS.map((d, idx) => {
                        const off = (row.offDays || []).includes(idx);
                        return (
                          <Chip
                            type="button"
                            key={d.key}
                            className={styles.dayChip}
                            isSelected={!off}
                            tone={off ? "neutral" : "accent"}
                            onPress={() => toggleOff(si, ri, idx)}
                            aria-label={`${d.long}: ${off ? "Off. Set to working." : "Working. Set to off."}`}
                          >
                            {d.short}
                          </Chip>
                        );
                      })}
                    </div>
                    <IconButton
                      variant="danger"
                      aria-label={`Remove ${row.name || "person"}`}
                      onPress={() => editShift(si, (s) => { s.rows.splice(ri, 1); })}
                    >
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </div>
                ))}
                <Button size="sm" onPress={() => editShift(si, (s) => { s.rows.push(blankRow()); })}>
                  <Plus aria-hidden="true" /> Add person
                </Button>
              </div>
            )}

            {shift.breaks.length > 0 && !unlocked && (
              <div className={styles.breaks}>
                {shift.breaks.map((b, bi) => (
                  <span className={styles.break} key={bi}><strong>{b.label}</strong> {b.time}</span>
                ))}
              </div>
            )}

            {unlocked && (
              <div className={`${styles.breaks} ${styles.breaksEdit}`}>
                {shift.breaks.map((b, bi) => (
                  <span className={styles.breakEdit} key={bi}>
                    <TextField
                      className={styles.breakLabel}
                      label="Break label"
                      labelHidden
                      value={b.label}
                      placeholder="Break"
                      onChange={(value) => editShift(si, (s) => { s.breaks[bi].label = value; })}
                    />
                    <TextField
                      className={styles.breakTime}
                      label="Break time"
                      labelHidden
                      value={b.time}
                      placeholder="00:00 - 00:00"
                      onChange={(value) => editShift(si, (s) => { s.breaks[bi].time = value; })}
                    />
                    <IconButton
                      size="sm"
                      variant="danger"
                      aria-label={`Remove ${b.label || "break"}`}
                      onPress={() => editShift(si, (s) => { s.breaks.splice(bi, 1); })}
                    >
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </span>
                ))}
                <Button
                  size="sm"
                  onPress={() => editShift(si, (s) => { s.breaks.push({ label: "Break", time: "" } as PickBreak); })}
                >
                  <Plus aria-hidden="true" /> Add break
                </Button>
              </div>
            )}
          </section>
        ))}
      </div>

      {unlocked && (
        <div className={styles.foot}>
          <Button onPress={() => edit((p) => { p.shifts.push(blankShift()); return p; })}>
            <Plus aria-hidden="true" /> Add shift
          </Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the work pick?"
        description="This replaces the current draft with the built-in schedule. Unsaved changes will be lost."
        confirmLabel="Reset schedule"
        tone="danger"
        onConfirm={resetToSeed}
      />
    </Panel>
  );
}
