"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Check, RotateCcw, Save, Search } from "lucide-react";
import {
  applyFlagConfig,
  editableFlagRows,
  type FlagAdminRow,
  type FlagConfig,
  type FlagConfigEntry,
  type FlagTier,
} from "../lib/grid";
import { getDeviceActor } from "../lib/deviceActor";
import ObjectCodePicker from "./ObjectCodePicker";

const TIERS: { id: FlagTier; label: string }[] = [
  { id: "high", label: "High (red)" },
  { id: "med", label: "Medium (amber)" },
  { id: "low", label: "Low (blue)" },
];

const TIER_SHORT: Record<FlagTier, string> = { high: "High", med: "Medium", low: "Low" };

const COLOR_PRESETS = ["#2563EB", "#0F766E", "#15803D", "#7C3AED", "#D97706", "#DC2626", "#DB2777", "#475569"];

const DEPTS = [
  { id: "service", label: "Service" },
  { id: "maintenance", label: "Maintenance" },
  { id: "safety", label: "Safety" },
];
const DEPT_LABEL: Record<string, string> = Object.fromEntries(DEPTS.map((d) => [d.id, d.label]));
const DEFAULT_FLAG_ROWS = new Map(editableFlagRows({ flags: {} }).map((row) => [row.id, row]));

function splitWords(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value.trim());
}

function safeColor(value: string): string {
  return isHexColor(value) ? value : "#2563EB";
}

function rowsToConfig(rows: FlagAdminRow[]): FlagConfig {
  const flags: Record<string, FlagConfigEntry> = {};
  for (const row of rows) {
    const base = DEFAULT_FLAG_ROWS.get(row.id);
    const unchanged = !!base &&
      row.name === base.name && row.label === base.label && row.tier === base.tier && row.color === base.color &&
      row.quick === base.quick && row.alwaysPrint === base.alwaysPrint && row.department === base.department &&
      row.active === base.active && row.aliases.join("\u0000") === base.aliases.join("\u0000") &&
      row.objectCodes.join("\u0000") === base.objectCodes.join("\u0000");
    if (unchanged) continue;
    flags[row.id] = {
      id: row.id,
      name: row.name.trim(),
      label: row.label.trim(),
      tier: row.tier,
      color: row.color,
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
  const [scope, setScope] = useState<"all" | "daily" | "object">("daily");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Deferred: typing repaints instantly; re-filtering the long flag list
  // (object codes are flags too — 400+ rows on "All") follows async.
  const deferredQuery = useDeferredValue(query);
  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (scope === "daily" && row.objectCode) return false;
      if (scope === "object" && !row.objectCode) return false;
      if (!q) return true;
      return (
        row.id.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q) ||
        row.objectCodes.join(" ").toLowerCase().includes(q) ||
        row.aliases.join(" ").toLowerCase().includes(q)
      );
    });
  }, [deferredQuery, rows, scope]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

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
          <p>Change how operational flags appear and behave across the sheets. Pick a flag to edit it — flag IDs stay locked so current buses never break.</p>
        </div>
        <div className="adminpanel__actions">
          {saved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
          <button className="btn" onClick={reloadDefaults} disabled={saving}>
            <RotateCcw size={16} /> Reset
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving || !loaded}>
            {saving ? "Saving…" : <><Save size={16} /> Save</>}
          </button>
        </div>
      </div>

      {!loaded && <div className="lotlist__empty">Loading flags…</div>}

      {loaded && (
        <div className={`flagedit ${selectedId ? "flagedit--detail" : ""}`}>
          <div className="flagedit__list">
            <div className="findbox flagedit__search">
              <Search size={15} />
              <input
                className="findbox__in"
                placeholder="Search flags, aliases, or object codes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flagedit__filters" aria-label="Flag groups">
              {(["all", "daily", "object"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={scope === value ? "flagedit__filter flagedit__filter--on" : "flagedit__filter"}
                  onClick={() => setScope(value)}
                >
                  {value === "all" ? "All" : value === "daily" ? "Daily flags" : "Object codes"}
                </button>
              ))}
            </div>
            <div className="flagedit__count">{shown.length} flag{shown.length === 1 ? "" : "s"}</div>
            <div className="flagedit__rows">
              {shown.length === 0 && <div className="lotlist__empty">No flags match.</div>}
              {shown.map((row) => (
                <button
                  key={row.id}
                  className={`flagrow2 ${row.id === selectedId ? "flagrow2--active" : ""} ${row.active ? "" : "flagrow2--off"}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className="flagrow2__dot" style={{ background: safeColor(row.color) }} />
                  <span className="flagrow2__body">
                    <span className="flagrow2__name">
                      {row.name || row.id}
                      {!row.active && <em className="flagrow2__tag">hidden</em>}
                      {row.quick && <em className="flagrow2__tag flagrow2__tag--quick">quick</em>}
                      {row.objectCode && <em className="flagrow2__tag">object code</em>}
                    </span>
                    <span className="flagrow2__meta">
                      <span className="flagrow2__code" style={{ color: safeColor(row.color) }}>{row.label || row.id}</span>
                      {" · "}{DEPT_LABEL[row.department] || row.department}
                      {" · "}{TIER_SHORT[row.tier]}
                      {row.objectCodes.length > 0 && <> · {row.objectCodes.length} code{row.objectCodes.length === 1 ? "" : "s"}</>}
                    </span>
                  </span>
                  <ChevronRight size={16} className="flagrow2__chev" />
                </button>
              ))}
            </div>
          </div>

          <div className="flagedit__detail">
            {!selected && <div className="flagedit__placeholder">Select a flag from the list to edit how it looks and behaves.</div>}
            {selected && (
              <div className="flagdetail" key={selected.id}>
                <div className="flagdetail__head">
                  <button className="flagdetail__back" onClick={() => setSelectedId(null)} aria-label="Back to list">
                    <ChevronLeft size={18} /> Flags
                  </button>
                  <span className="fpill fpill--custom" style={{ "--flag-color": safeColor(selected.color) } as CSSProperties}>
                    {selected.label || selected.id}
                  </span>
                  <small className="flagdetail__id">{selected.id}</small>
                </div>

                <div className="flagdetail__grid">
                  <label className="adminfield">
                    <span>Name (menus)</span>
                    <input value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value })} />
                  </label>
                  <label className="adminfield">
                    <span>Sheet code (printed)</span>
                    <input value={selected.label} onChange={(e) => update(selected.id, { label: e.target.value })} />
                  </label>

                  <label className="adminfield adminfield--color adminfield--wide">
                    <span>Color</span>
                    <div className="colorfield">
                      <input
                        className="colorfield__picker"
                        type="color"
                        value={safeColor(selected.color)}
                        onChange={(e) => update(selected.id, { color: e.target.value.toUpperCase() })}
                        aria-label={`${selected.name} color`}
                      />
                      <input
                        className="colorfield__hex"
                        value={selected.color}
                        onChange={(e) => update(selected.id, { color: e.target.value.toUpperCase() })}
                        onBlur={(e) => {
                          if (!isHexColor(e.target.value.trim())) update(selected.id, { color: "#2563EB" });
                        }}
                        spellCheck={false}
                      />
                    </div>
                    <div className="colorswatches" aria-label="Color presets">
                      {COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`colorswatch ${selected.color.toUpperCase() === color ? "colorswatch--on" : ""}`}
                          style={{ "--swatch": color } as CSSProperties}
                          onClick={() => update(selected.id, { color })}
                          aria-label={color}
                        />
                      ))}
                    </div>
                  </label>

                  <label className="adminfield">
                    <span>Priority</span>
                    <select value={selected.tier} onChange={(e) => update(selected.id, { tier: e.target.value as FlagTier })}>
                      {TIERS.map((tier) => (
                        <option key={tier.id} value={tier.id}>{tier.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="adminfield">
                    <span>Department</span>
                    <select value={selected.department} onChange={(e) => update(selected.id, { department: e.target.value })}>
                      {DEPTS.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.label}</option>
                      ))}
                    </select>
                  </label>

                  {selected.objectCode ? (
                    <label className="adminfield adminfield--wide">
                      <span>Object code</span>
                      <input value={selected.objectCodes[0] || selected.label} readOnly aria-readonly="true" />
                    </label>
                  ) : (
                    <label className="adminfield adminfield--wide">
                      <span>Object codes</span>
                      <ObjectCodePicker
                        value={selected.objectCodes}
                        onChange={(codes) => update(selected.id, { objectCodes: codes })}
                      />
                    </label>
                  )}

                  <label className="adminfield adminfield--wide">
                    <span>Search aliases (comma separated)</span>
                    <input
                      value={selected.aliases.join(", ")}
                      onChange={(e) => update(selected.id, { aliases: splitWords(e.target.value) })}
                      placeholder="e.g. air conditioning, climate, cold"
                    />
                  </label>

                  <div className="adminchecks adminfield--wide">
                    <label><input type="checkbox" checked={selected.quick} onChange={(e) => update(selected.id, { quick: e.target.checked })} /> Quick chip</label>
                    <label><input type="checkbox" checked={selected.alwaysPrint} onChange={(e) => update(selected.id, { alwaysPrint: e.target.checked })} /> Always print</label>
                    <label><input type="checkbox" checked={selected.active} onChange={(e) => update(selected.id, { active: e.target.checked })} /> Active (shown in menus)</label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
