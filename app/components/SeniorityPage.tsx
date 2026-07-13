"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Lock, Plus, Save, Trash2 } from "lucide-react";
import type { Employee } from "../lib/types";
import { UNAVAILABLE_REASONS } from "../lib/staffing";
import { useEmployees } from "../lib/queries";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import AdminUnlockButton from "./AdminUnlockButton";

// Normalize a stored record (possibly legacy {name, badge}) into the full shape.
function normalize(e: Partial<Employee> & { name?: string }): Employee {
  let firstName = (e.firstName || "").trim();
  let lastName = (e.lastName || "").trim();
  if (!firstName && !lastName && e.name) {
    const parts = e.name.trim().split(/\s+/);
    firstName = parts.shift() || "";
    lastName = parts.join(" ");
  }
  return {
    firstName,
    lastName,
    badge: (e.badge || "").trim(),
    startDate: (e.startDate || "").trim(),
    hireDate: (e.hireDate || "").trim(),
    classification: (e.classification || "").trim(),
    availability: (e.availability || "").trim(),
  };
}

const EMPTY: Employee = { firstName: "", lastName: "", badge: "", startDate: "", hireDate: "", classification: "", availability: "" };
type SortKey = "firstName" | "lastName" | "badge" | "startDate" | "hireDate" | "classification";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "classification", label: "Classification" },
  { key: "startDate", label: "Shop seniority" },
  { key: "hireDate", label: "Pace hire date" },
  { key: "badge", label: "Employee ID" },
];

// ISO "YYYY-MM-DD" → "M/D/YYYY"; anything else shown as-is; empty → dash.
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  return iso;
}

export default function SeniorityPage() {
  const { unlocked, tryUnlock, lock } = useAdminUnlock();
  const [rows, setRows] = useState<Employee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Read the shared roster from the app-wide cache, but seed the editable draft
  // exactly ONCE — a background refetch (or the live pulse) must never overwrite
  // in-progress edits. Save still re-seeds `rows` locally from its own response.
  const { data: employees, isSuccess, isError } = useEmployees();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (isSuccess) {
      setRows((employees || []).map(normalize));
      seededRef.current = true;
      setLoaded(true);
    } else if (isError) {
      seededRef.current = true;
      setLoaded(true); // don't hang on "Loading…" if the fetch failed
    }
  }, [isSuccess, isError, employees]);

  function setRow(i: number, key: keyof Employee, val: string) {
    setSaved(false);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  }
  function removeRow(i: number) {
    setSaved(false);
    setRows((rs) => rs.filter((_, j) => j !== i));
  }
  function addRow() {
    setSaved(false);
    setRows((rs) => [...rs, { ...EMPTY }]);
  }
  async function save() {
    setSaving(true);
    setSaved(false);
    const clean = rows.filter((r) => r.firstName.trim() || r.lastName.trim() || r.badge.trim());
    const res = await fetch("/api/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: clean }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setSaving(false);
    if (res && res.ok) {
      setRows((res.employees || []).map(normalize));
      setSaved(true);
    }
  }

  const q = query.trim().toLowerCase();
  function chooseSort(key: SortKey) {
    if (sortKey === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }
  function SortIcon({ field }: { field: SortKey }) {
    if (sortKey !== field) return <ArrowUpDown size={13} />;
    return sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  }

  const shown = rows
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        !q ||
        r.firstName.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q) ||
        r.badge.toLowerCase().includes(q) ||
        r.classification.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      const av = String(a.r[sortKey] || "").trim();
      const bv = String(b.r[sortKey] || "").trim();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const order = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? order : -order;
    });

  return (
    <section className="adminpanel">
      <div className="adminpanel__head">
        <div>
          <h2>Seniority</h2>
          <p>The shop seniority list. Drives the Work Pick and the Home “Available Now” roster.</p>
        </div>
        <div className="adminpanel__actions">
          {unlocked ? (
            <>
              {saved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
              <button className="btn" onClick={lock} title="Lock editing">
                <Lock size={15} /> Done
              </button>
              <button className="btn btn--primary" onClick={save} disabled={saving || !loaded}>
                {saving ? "Saving…" : <><Save size={16} /> Save</>}
              </button>
            </>
          ) : (
            <AdminUnlockButton onSubmit={tryUnlock} label="Edit list" />
          )}
        </div>
      </div>

      <div className="adminflag__toolbar">
        <input
          className="manager__search buslist__search"
          placeholder="Search name, employee ID, or classification…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="adminflag__count">{rows.length} employees</span>
      </div>

      {!loaded && <div className="lotlist__empty">Loading…</div>}

      {loaded && !unlocked && (
        <div className="sentable">
          <div className="sentable__head">
            {SORT_OPTIONS.map((option) => (
              <button
                type="button"
                className={`sentable__sort ${sortKey === option.key ? "sentable__sort--active" : ""}`}
                onClick={() => chooseSort(option.key)}
                key={option.key}
              >
                {option.label}<SortIcon field={option.key} />
              </button>
            ))}
          </div>
          {shown.length === 0 && <div className="lotlist__empty">No matching employees.</div>}
          {shown.map(({ r, i }) => {
            const out = !!(r.availability && r.availability.trim());
            return (
              <div className={`sentable__row ${out ? "sentable__row--out" : ""}`} key={i}>
                <span data-label="First">{r.firstName || "—"}</span>
                <span data-label="Last">{r.lastName || "—"}</span>
                <span data-label="Classification">
                  {r.classification || "—"}
                  {out && <span className="senstatus">{r.availability}</span>}
                </span>
                <span data-label="Shop seniority">{fmtDate(r.startDate)}</span>
                <span data-label="Pace hire">{fmtDate(r.hireDate)}</span>
                <span data-label="Employee ID">{r.badge || "—"}</span>
              </div>
            );
          })}
        </div>
      )}

      {loaded && unlocked && (
        <>
          <div className="emptable emptable--sen">
            <div className="emptable__head">
              {SORT_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={`emptable__sort ${sortKey === option.key ? "emptable__sort--active" : ""}`}
                  onClick={() => chooseSort(option.key)}
                  key={option.key}
                >
                  {option.label}<SortIcon field={option.key} />
                </button>
              ))}
              <span className="emptable__statushead">Status</span>
              <span />
            </div>
            {rows.length === 0 && (
              <div className="lotlist__empty">No employees yet — press “Add employee”.</div>
            )}
            {shown.map(({ r, i }) => (
              <div className="emptable__row" key={i}>
                <label className="emptable__cell">
                  <span className="emptable__label">First name</span>
                  <input value={r.firstName} placeholder="First" onChange={(e) => setRow(i, "firstName", e.target.value)} />
                </label>
                <label className="emptable__cell">
                  <span className="emptable__label">Last name</span>
                  <input value={r.lastName} placeholder="Last" onChange={(e) => setRow(i, "lastName", e.target.value)} />
                </label>
                <label className="emptable__cell">
                  <span className="emptable__label">Classification</span>
                  <input value={r.classification} placeholder="Job title" onChange={(e) => setRow(i, "classification", e.target.value)} />
                </label>
                <label className="emptable__cell">
                  <span className="emptable__label">Shop seniority</span>
                  <input type="date" value={r.startDate} onChange={(e) => setRow(i, "startDate", e.target.value)} />
                </label>
                <label className="emptable__cell">
                  <span className="emptable__label">Pace hire date</span>
                  <input type="date" value={r.hireDate} onChange={(e) => setRow(i, "hireDate", e.target.value)} />
                </label>
                <label className="emptable__cell">
                  <span className="emptable__label">Employee ID</span>
                  <input value={r.badge} placeholder="Employee ID" inputMode="numeric" onChange={(e) => setRow(i, "badge", e.target.value)} />
                </label>
                <label className={`emptable__cell emptable__status ${r.availability ? "emptable__status--out" : ""}`}>
                  <span className="emptable__label">Status</span>
                  <select value={r.availability || ""} onChange={(e) => setRow(i, "availability", e.target.value)}>
                    <option value="">Available</option>
                    {UNAVAILABLE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                    {r.availability && !UNAVAILABLE_REASONS.includes(r.availability) && (
                      <option value={r.availability}>{r.availability}</option>
                    )}
                  </select>
                </label>
                <button className="lotitem__del emptable__del" onClick={() => removeRow(i)} aria-label="Remove employee" title="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="emplist__foot">
            <button className="btn" onClick={addRow}>
              <Plus size={16} /> Add employee
            </button>
          </div>
        </>
      )}
    </section>
  );
}
