"use client";

import { useEffect, useState } from "react";
import { useScrollLock } from "../lib/useScrollLock";

// Manage the shared employee list (name + badge) used for Turnover autofill.
// Simple add/remove rows; everyday staff can keep it current. Free text is still
// allowed on the sheets, so this only needs the people you want suggested.
export default function EmployeesEditor({ onClose }) {
  useScrollLock();
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setRows(d.employees || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function setRow(i, key, val) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  }
  function removeRow(i) {
    setRows((rs) => rs.filter((_, j) => j !== i));
  }
  function addRow() {
    setRows((rs) => [...rs, { name: "", badge: "" }]);
  }
  async function save() {
    setSaving(true);
    const clean = rows.filter((r) => (r.name || "").trim() || (r.badge || "").trim());
    const res = await fetch("/api/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: clean }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setSaving(false);
    if (res && res.ok) onClose();
  }

  const q = query.trim().toLowerCase();
  const shown = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      !q ||
      (r.name || "").toLowerCase().includes(q) ||
      (r.badge || "").toLowerCase().includes(q)
    );

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal modal--tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <div className="modal__title">Employees</div>
            <div className="modal__sub">Name + badge number, used to autofill the Turnover sheet.</div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          className="manager__search"
          placeholder="Search name or badge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="emplist">
          {!loaded && <div className="lotlist__empty">Loading…</div>}
          {loaded && rows.length === 0 && (
            <div className="lotlist__empty">No employees yet — press “Add employee”.</div>
          )}
          {shown.map(({ r, i }) => (
            <div className="emprow" key={i}>
              <input
                className="emprow__name"
                placeholder="Name"
                value={r.name || ""}
                onChange={(e) => setRow(i, "name", e.target.value)}
              />
              <input
                className="emprow__badge"
                placeholder="Badge #"
                value={r.badge || ""}
                onChange={(e) => setRow(i, "badge", e.target.value)}
              />
              <button className="busrow__clear" onClick={() => removeRow(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="modal__actions">
          <button className="btn" onClick={addRow}>
            + Add employee
          </button>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
