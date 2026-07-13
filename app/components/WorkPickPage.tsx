"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lock, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import type { Employee } from "../lib/types";
import { employeeFullName } from "../lib/types";
import { DAYS, STAFF_ROLES, type PickBreak, type PickRow, type PickShift, type WorkPick } from "../lib/staffing";
import { WORK_PICK_SEED } from "../lib/workPickSeed";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import AdminUnlockButton from "./AdminUnlockButton";
import EmployeeInput from "./EmployeeInput";

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const shiftsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/state/workpick", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/employees").then((r) => r.json()).catch(() => ({})),
    ]).then(([pickRes, empRes]) => {
      const value = (pickRes && pickRes.value) as WorkPick | null;
      setPick(value && Array.isArray(value.shifts) ? value : WORK_PICK_SEED);
      setEmployees((empRes && empRes.employees) || []);
      setLoaded(true);
    });
  }, []);

  // Bring the first highlighted spot into view when the search changes.
  useEffect(() => {
    if (!search.trim()) return;
    const el = shiftsRef.current?.querySelector(".picktable__row--match, .pickedit__row--match");
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
    if (!confirm("Replace the current pick with the built-in schedule? Unsaved changes will be lost.")) return;
    setSaved(false);
    setPick(structuredClone(WORK_PICK_SEED));
  }

  if (!loaded || !pick) {
    return (
      <section className="adminpanel">
        <div className="lotlist__empty">Loading…</div>
      </section>
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
    <section className="adminpanel">
      <div className="adminpanel__head">
        <div>
          <h2>Work Pick</h2>
          <p>
            {unlocked ? (
              <>Editing the shared work pick. This is what Home reads for “Available Now”.</>
            ) : (
              <>Effective <strong>{fmtDate(pick.effective)}</strong>. Highlighted days are worked; “OFF” days are off.</>
            )}
          </p>
        </div>
        <div className="adminpanel__actions">
          {unlocked ? (
            <>
              {saved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
              <button className="btn" onClick={lock} title="Lock editing">
                <Lock size={15} /> Done
              </button>
              <button className="btn" onClick={resetToSeed} title="Reload the built-in schedule">
                <RotateCcw size={15} /> Reset
              </button>
              <button className="btn btn--primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : <><Save size={16} /> Save pick</>}
              </button>
            </>
          ) : (
            <AdminUnlockButton onSubmit={tryUnlock} label="Edit pick" />
          )}
        </div>
      </div>

      <div className="picksearch">
        <Search size={16} className="picksearch__icon" />
        <input
          className="manager__search"
          placeholder="Find an employee on the pick…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <>
            <span className="picksearch__count">{matchCount} {matchCount === 1 ? "match" : "matches"}</span>
            <button className="picksearch__clear" onClick={() => setSearch("")} aria-label="Clear search" title="Clear">
              <X size={15} />
            </button>
          </>
        )}
      </div>

      {unlocked && (
        <label className="pickeff">
          <span>Effective date</span>
          <input
            type="date"
            value={pick.effective}
            onChange={(e) => edit((p) => { p.effective = e.target.value; return p; })}
          />
        </label>
      )}

      <div className="pickshifts" ref={shiftsRef}>
        {pick.shifts.map((shift, si) => (
          <div className="pickshift" key={shift.id}>
            <div className="pickshift__head">
              {unlocked ? (
                <div className="pickshift__edithead">
                  <input
                    className="pickshift__name"
                    value={shift.name}
                    onChange={(e) => editShift(si, (s) => { s.name = e.target.value; })}
                  />
                  <span className="pickshift__times">
                    <input type="time" value={shift.start} onChange={(e) => editShift(si, (s) => { s.start = e.target.value; })} />
                    <span>–</span>
                    <input type="time" value={shift.end} onChange={(e) => editShift(si, (s) => { s.end = e.target.value; })} />
                  </span>
                  <button
                    className="lotitem__del"
                    title="Remove shift"
                    onClick={() => edit((p) => { p.shifts.splice(si, 1); return p; })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <h3>{shift.name}</h3>
                  <span className="pickshift__times">{shift.start} – {shift.end}</span>
                </>
              )}
            </div>

            {!unlocked ? (
              <div className="picktable" role="table">
                <div className="picktable__head" role="row">
                  <span className="picktable__role">Role</span>
                  <span className="picktable__name">Employee</span>
                  {DAYS.map((d) => <span className="pickday" key={d.key}>{d.short}</span>)}
                  <span className="picktable__off">Off days</span>
                </div>
                {shift.rows.length === 0 && <div className="lotlist__empty">No one on this shift.</div>}
                {shift.rows.map((row) => {
                  const outReason = row.employeeId ? unavailableById.get(row.employeeId) : undefined;
                  return (
                  <div className={`picktable__row ${rowMatches(row) ? "picktable__row--match" : ""}`} role="row" key={row.id}>
                    <span className="picktable__role" data-label="Role">{row.role}</span>
                    <span className="picktable__name" data-label="Employee">
                      <span className={outReason ? "picktable__name--out" : ""}>{row.name || "—"}</span>
                      {outReason && <span className="pickout">{outReason}</span>}
                    </span>
                    {DAYS.map((d, idx) => {
                      const off = (row.offDays || []).includes(idx);
                      return (
                        <span className={`pickday ${off ? "pickday--off" : "pickday--on"}`} key={d.key} title={`${d.long}: ${off ? "Off" : "Working"}`}>
                          {off ? "OFF" : "•"}
                        </span>
                      );
                    })}
                    <span className="picktable__off" data-label="Off days">{offLabel(row.offDays || [])}</span>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="pickedit">
                {shift.rows.map((row, ri) => (
                  <div className={`pickedit__row ${rowMatches(row) ? "pickedit__row--match" : ""}`} key={row.id}>
                    <select
                      className="pickedit__role"
                      value={row.role}
                      onChange={(e) => editShift(si, (s) => { s.rows[ri].role = e.target.value; })}
                    >
                      {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      {!STAFF_ROLES.includes(row.role) && <option value={row.role}>{row.role}</option>}
                    </select>
                    <EmployeeInput
                      className="pickedit__name"
                      value={row.name}
                      employees={employees}
                      placeholder="Employee"
                      onChange={(v) => setRowName(si, ri, v)}
                    />
                    <div className="pickedit__days" role="group" aria-label="Working days">
                      {DAYS.map((d, idx) => {
                        const off = (row.offDays || []).includes(idx);
                        return (
                          <button
                            type="button"
                            key={d.key}
                            className={`pickdaybtn ${off ? "pickdaybtn--off" : "pickdaybtn--on"}`}
                            onClick={() => toggleOff(si, ri, idx)}
                            title={`${d.long}: ${off ? "Off (tap to work)" : "Working (tap for off)"}`}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="lotitem__del"
                      title="Remove row"
                      onClick={() => editShift(si, (s) => { s.rows.splice(ri, 1); })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button className="btn btn--small" onClick={() => editShift(si, (s) => { s.rows.push(blankRow()); })}>
                  <Plus size={14} /> Add person
                </button>
              </div>
            )}

            {shift.breaks.length > 0 && !unlocked && (
              <div className="pickbreaks">
                {shift.breaks.map((b, bi) => (
                  <span className="pickbreak" key={bi}><strong>{b.label}</strong> {b.time}</span>
                ))}
              </div>
            )}

            {unlocked && (
              <div className="pickbreaks pickbreaks--edit">
                {shift.breaks.map((b, bi) => (
                  <span className="pickbreak pickbreak--edit" key={bi}>
                    <input
                      value={b.label}
                      placeholder="Break"
                      onChange={(e) => editShift(si, (s) => { s.breaks[bi].label = e.target.value; })}
                    />
                    <input
                      value={b.time}
                      placeholder="00:00 - 00:00"
                      onChange={(e) => editShift(si, (s) => { s.breaks[bi].time = e.target.value; })}
                    />
                    <button className="lotitem__del" title="Remove break" onClick={() => editShift(si, (s) => { s.breaks.splice(bi, 1); })}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                ))}
                <button
                  className="btn btn--small"
                  onClick={() => editShift(si, (s) => { s.breaks.push({ label: "Break", time: "" } as PickBreak); })}
                >
                  <Plus size={14} /> Add break
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {unlocked && (
        <div className="emplist__foot">
          <button className="btn" onClick={() => edit((p) => { p.shifts.push(blankShift()); return p; })}>
            <Plus size={16} /> Add shift
          </button>
        </div>
      )}
    </section>
  );
}
