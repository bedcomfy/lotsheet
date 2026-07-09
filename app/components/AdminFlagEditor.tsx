"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Save, Search } from "lucide-react";
import {
  applyFlagConfig,
  type FlagAdminRow,
  type FlagConfig,
  type FlagConfigEntry,
  type FlagTier,
} from "../lib/grid";
import { getDeviceActor } from "../lib/deviceActor";

const TIERS: { id: FlagTier; label: string }[] = [
  { id: "low", label: "Blue" },
  { id: "med", label: "Amber" },
  { id: "high", label: "Red" },
];

const DEPTS = [
  { id: "service", label: "Service" },
  { id: "maintenance", label: "Maintenance" },
  { id: "safety", label: "Safety" },
];

const TIER_CLASS: Record<FlagTier, string> = { high: "safety", med: "maintenance", low: "service" };

function splitWords(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowsToConfig(rows: FlagAdminRow[]): FlagConfig {
  const flags: Record<string, FlagConfigEntry> = {};
  for (const row of rows) {
    flags[row.id] = {
      id: row.id,
      name: row.name.trim(),
      label: row.label.trim(),
      tier: row.tier,
      aliases: row.aliases,
      objectCodes: row.objectCodes,
      quick: row.quick,
      alwaysPrint: row.alwaysPrint,
      department: row.department,
      active: row.active,
    };
  }
  return { flags };
}

export default function AdminFlagEditor() {
  const [rows, setRows] = useState<FlagAdminRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/flag-config")
      .then((r) => r.json())
      .then((data) => {
        applyFlagConfig(data?.config || {});
        setRows(data?.flags || []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.id.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q) ||
        row.objectCodes.join(" ").toLowerCase().includes(q) ||
        row.aliases.join(" ").toLowerCase().includes(q)
    );
  }, [query, rows]);

  function update(id: string, patch: Partial<FlagAdminRow>) {
    setSaved(false);
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const config = rowsToConfig(rows);
    const res = await fetch("/api/admin/flag-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, actor: getDeviceActor() }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.config) applyFlagConfig(res.config);
    if (res?.flags) setRows(res.flags);
    setSaving(false);
    setSaved(!!res?.ok);
  }

  async function reloadDefaults() {
    if (!window.confirm("Reset all flag display overrides back to the built-in defaults?")) return;
    setLoaded(false);
    setSaved(false);
    await fetch("/api/admin/flag-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { flags: {} }, actor: getDeviceActor() }),
    })
      .then((r) => r.json())
      .then((data) => {
        applyFlagConfig(data?.config || {});
        setRows(data?.flags || []);
      })
      .finally(() => setLoaded(true));
  }

  return (
    <section className="adminpanel">
      <div className="adminpanel__head">
        <div>
          <h2>Flag Editor</h2>
          <p>Change how operational flags appear and behave across the sheets. Existing flag IDs stay locked so current buses do not break.</p>
        </div>
        <div className="adminpanel__actions">
          <button className="btn" onClick={reloadDefaults} disabled={saving}>
            <RotateCcw size={16} /> Reset
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving || !loaded}>
            {saving ? "Saving..." : <><Save size={16} /> Save</>}
          </button>
        </div>
      </div>

      <div className="adminflag__toolbar">
        <div className="findbox adminflag__search">
          <Search size={15} />
          <input
            className="findbox__in"
            placeholder="Search flags, aliases, or object codes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="adminflag__count">{shown.length} flags</span>
        {saved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
      </div>

      {!loaded && <div className="lotlist__empty">Loading flags...</div>}
      {loaded && (
        <div className="adminflag">
          <div className="adminflag__header">
            <span>Flag</span>
            <span>Sheet Alias</span>
            <span>Color</span>
            <span>Options</span>
          </div>
          {shown.map((row) => (
            <div className="adminflag__row" key={row.id}>
              <div className="adminflag__main">
                <span className={`fpill fpill--${TIER_CLASS[row.tier]}`}>{row.label || row.id}</span>
                <small>{row.id}</small>
              </div>
              <label className="adminfield">
                <span>Name</span>
                <input value={row.name} onChange={(e) => update(row.id, { name: e.target.value })} />
              </label>
              <label className="adminfield">
                <span>Alias</span>
                <input value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
              </label>
              <label className="adminfield">
                <span>Color</span>
                <select value={row.tier} onChange={(e) => update(row.id, { tier: e.target.value as FlagTier })}>
                  {TIERS.map((tier) => (
                    <option key={tier.id} value={tier.id}>{tier.label}</option>
                  ))}
                </select>
              </label>
              <label className="adminfield">
                <span>Department</span>
                <select value={row.department} onChange={(e) => update(row.id, { department: e.target.value })}>
                  {DEPTS.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.label}</option>
                  ))}
                </select>
              </label>
              <label className="adminfield adminfield--wide">
                <span>Object codes</span>
                <input
                  value={row.objectCodes.join(", ")}
                  onChange={(e) => update(row.id, { objectCodes: splitWords(e.target.value) })}
                />
              </label>
              <label className="adminfield adminfield--wide">
                <span>Search aliases</span>
                <input
                  value={row.aliases.join(", ")}
                  onChange={(e) => update(row.id, { aliases: splitWords(e.target.value) })}
                />
              </label>
              <div className="adminchecks">
                <label><input type="checkbox" checked={row.quick} onChange={(e) => update(row.id, { quick: e.target.checked })} /> Quick chip</label>
                <label><input type="checkbox" checked={row.alwaysPrint} onChange={(e) => update(row.id, { alwaysPrint: e.target.checked })} /> Always print</label>
                <label><input type="checkbox" checked={row.active} onChange={(e) => update(row.id, { active: e.target.checked })} /> Active</label>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
