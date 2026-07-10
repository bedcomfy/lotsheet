"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import type { Employee } from "../lib/types";

// Normalize a stored record (which may be legacy {name, badge}) into the full
// first/last/startDate/classification shape the editor works with.
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
  };
}

const EMPTY: Employee = { firstName: "", lastName: "", badge: "", startDate: "", hireDate: "", classification: "" };

export default function AdminEmployeesPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setRows((d.employees || []).map(normalize)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

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
  const shown = rows
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        !q ||
        r.firstName.toLowerCase().includes(q) ||
        r.lastName.toLowerCase().includes(q) ||
        r.badge.toLowerCase().includes(q) ||
        r.classification.toLowerCase().includes(q)
    );

  return (
    <section className="adminpanel">
      <div className="adminpanel__head">
        <div>
          <h2>Employees</h2>
          <p>Name, employee ID, seniority, hire date, and classification. Used to autofill the Turnover sheet and upcoming staffing sheets.</p>
        </div>
        <div className="adminpanel__actions">
          {saved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
          <button className="btn btn--primary" onClick={save} disabled={saving || !loaded}>
            {saving ? "Saving…" : <><Save size={16} /> Save</>}
          </button>
        </div>
      </div>

      <div className="adminflag__toolbar">
        <input
          className="manager__search buslist__search"
          placeholder="Search name, badge, or job title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="adminflag__count">{rows.length} employees</span>
      </div>

      <div className="emptable">
        <div className="emptable__head">
          <span>First name</span>
          <span>Last name</span>
          <span>Badge #</span>
          <span>Shop seniority</span>
          <span>Pace hire date</span>
          <span>Classification</span>
          <span />
        </div>
        {!loaded && <div className="lotlist__empty">Loading…</div>}
        {loaded && rows.length === 0 && (
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
              <span className="emptable__label">Badge #</span>
              <input value={r.badge} placeholder="Badge #" inputMode="numeric" onChange={(e) => setRow(i, "badge", e.target.value)} />
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
              <span className="emptable__label">Classification</span>
              <input value={r.classification} placeholder="Job title" onChange={(e) => setRow(i, "classification", e.target.value)} />
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
    </section>
  );
}
