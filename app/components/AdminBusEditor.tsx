"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { BUS_TYPES, applyBusTypeConfig, type BusTypeAdminRow, type BusTypeConfig } from "../lib/grid";
import { busTypeIds, BUS_STATUSES } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import CsvEditor from "./CsvEditor";
import { getDeviceActor } from "../lib/deviceActor";
import type { MasterBus } from "../lib/types";

const COLOR_PRESETS = ["#7C3AED", "#15803D", "#B45309", "#0F766E", "#B91C1C", "#2563EB", "#DB2777", "#475569"];
const BUILTIN_TYPE_IDS = BUS_TYPES.map((t) => t.id);

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value.trim());
}
function safeColor(value: string): string {
  return isHexColor(value) ? value : "#475569";
}

function typeRowsToConfig(rows: BusTypeAdminRow[]): BusTypeConfig {
  const types: BusTypeConfig["types"] = {};
  const present = new Set(rows.map((r) => r.id));
  for (const row of rows) {
    types[row.id] = {
      id: row.id,
      label: row.label.trim() || row.id,
      code: row.code.trim(),
      color: row.color,
      ...(row.builtin ? {} : { custom: true }),
    };
  }
  // A built-in that's no longer in the list has been removed by the admin.
  for (const id of BUILTIN_TYPE_IDS) if (!present.has(id)) types[id] = { id, removed: true };
  return { types };
}

export default function AdminBusEditor() {
  const { master, setMaster } = useBusMaster();

  // ----- fleet rows -----
  const [buses, setBuses] = useState<MasterBus[]>(() => master.buses.map((b) => ({ ...b })));
  const [filter, setFilter] = useState("");
  const [busSaving, setBusSaving] = useState(false);
  const [busDirty, setBusDirty] = useState(false);
  const [busSaved, setBusSaved] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  // ----- appearance / type list -----
  const [typeRows, setTypeRows] = useState<BusTypeAdminRow[]>([]);
  const [typeLoaded, setTypeLoaded] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeSaved, setTypeSaved] = useState(false);
  const addCount = useRef(0);

  useEffect(() => {
    fetch("/api/admin/bus-type-config")
      .then((r) => r.json())
      .then((data) => {
        applyBusTypeConfig(data?.config || {});
        setTypeRows(data?.types || []);
      })
      .catch(() => {})
      .finally(() => setTypeLoaded(true));
  }, []);

  const typeById = useMemo(() => Object.fromEntries(typeRows.map((t) => [t.id, t] as [string, BusTypeAdminRow])), [typeRows]);

  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase();
    if (!f) return buses;
    return buses.filter(
      (b) => b.num.includes(f) || (b.model || "").toUpperCase().includes(f) || (b.name || "").toUpperCase().includes(f)
    );
  }, [buses, filter]);

  // ---- fleet edits ----
  function updateBus(num: string, patch: Partial<MasterBus>) {
    setBuses((list) => list.map((b) => (b.num === num ? { ...b, ...patch } : b)));
    setBusDirty(true);
    setBusSaved(false);
  }
  function toggleBusType(bus: MasterBus, typeId: string) {
    const ids = new Set(busTypeIds(bus));
    if (ids.has(typeId)) ids.delete(typeId);
    else ids.add(typeId);
    updateBus(bus.num, { types: Array.from(ids) });
  }

  async function saveBuses() {
    setBusSaving(true);
    try {
      const res = await fetch("/api/buses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master: { buses } }),
      });
      const d = await res.json().catch(() => ({}));
      if (d && d.master) {
        setMaster(d.master);
        setBuses(d.master.buses.map((b: MasterBus) => ({ ...b })));
        setBusDirty(false);
        setBusSaved(true);
      }
    } finally {
      setBusSaving(false);
    }
  }

  // ---- appearance edits ----
  function updateType(id: string, patch: Partial<BusTypeAdminRow>) {
    setTypeRows((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setTypeSaved(false);
  }
  function addType() {
    const id = `custom-${Date.now().toString(36)}-${addCount.current++}`;
    setTypeRows((list) => [...list, { id, label: "New type", code: "", color: "#2563EB", builtin: false }]);
    setTypeSaved(false);
  }
  function removeType(id: string) {
    const row = typeRows.find((t) => t.id === id);
    const msg = row?.builtin
      ? `Remove the built-in type "${row.label}"? Buses tagged with it will no longer show its code. You can bring it back with Reset.`
      : `Remove the type "${row?.label}"?`;
    if (!window.confirm(msg)) return;
    setTypeRows((list) => list.filter((t) => t.id !== id));
    setTypeSaved(false);
  }

  async function saveTypes() {
    setTypeSaving(true);
    setTypeSaved(false);
    const config = typeRowsToConfig(typeRows);
    const res = await fetch("/api/admin/bus-type-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, actor: getDeviceActor() }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.config) applyBusTypeConfig(res.config);
    if (res?.types) setTypeRows(res.types);
    setTypeSaving(false);
    setTypeSaved(!!res?.ok);
  }

  async function resetTypes() {
    if (!window.confirm("Reset the bus types (codes, colors, added/removed types) back to the built-in defaults?")) return;
    setTypeLoaded(false);
    setTypeSaved(false);
    await fetch("/api/admin/bus-type-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { types: {} }, actor: getDeviceActor() }),
    })
      .then((r) => r.json())
      .then((data) => {
        applyBusTypeConfig(data?.config || {});
        setTypeRows(data?.types || []);
      })
      .finally(() => setTypeLoaded(true));
  }

  // Live code badges for a bus (reflects unsaved type + appearance edits).
  function CodePreview({ ids }: { ids: string[] }) {
    const visible = ids.map((id) => typeById[id]).filter((t) => t && t.code);
    if (visible.length === 0) return <span className="busprev busprev--none">—</span>;
    return (
      <span className="busprev">
        {visible.map((t, i) => (
          <span key={t.id} className="busprev__seg">
            {i > 0 && <span className="busprev__sep">/</span>}
            <span className="badge" style={{ color: safeColor(t.color) }}>{t.code}</span>
          </span>
        ))}
      </span>
    );
  }

  if (csvOpen) {
    return (
      <CsvEditor
        onClose={() => setCsvOpen(false)}
        onSaved={async () => {
          const d = await fetch("/api/buses").then((r) => r.json()).catch(() => null);
          if (d && d.master) {
            setMaster(d.master);
            setBuses(d.master.buses.map((b: MasterBus) => ({ ...b })));
          }
          setCsvOpen(false);
        }}
      />
    );
  }

  return (
    <>
      {/* ---------- Types / appearance ---------- */}
      <section className="adminpanel">
        <div className="adminpanel__head">
          <div>
            <h2>Bus Types</h2>
            <p>The types a bus can be, and how each looks on the Lot Sheet (corner code + color). Add or remove types here; a blank code shows no badge (like Standard).</p>
          </div>
          <div className="adminpanel__actions">
            {typeSaved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
            <button className="btn" onClick={resetTypes} disabled={typeSaving}>
              <RotateCcw size={16} /> Reset
            </button>
            <button className="btn btn--primary" onClick={saveTypes} disabled={typeSaving || !typeLoaded}>
              {typeSaving ? "Saving…" : <><Save size={16} /> Save types</>}
            </button>
          </div>
        </div>

        {!typeLoaded && <div className="lotlist__empty">Loading types…</div>}
        {typeLoaded && (
          <>
            <div className="bustypes">
              {typeRows.map((t) => (
                <div className="bustype" key={t.id}>
                  <div className="bustype__preview">
                    {t.code
                      ? <span className="badge bustype__badge" style={{ color: safeColor(t.color) }}>{t.code}</span>
                      : <span className="bustype__badge bustype__badge--none">no badge</span>}
                  </div>
                  <label className="adminfield">
                    <span>Name</span>
                    <input value={t.label} onChange={(e) => updateType(t.id, { label: e.target.value })} />
                  </label>
                  <label className="adminfield">
                    <span>Code</span>
                    <input value={t.code} placeholder="(blank = none)" onChange={(e) => updateType(t.id, { code: e.target.value })} />
                  </label>
                  <label className="adminfield adminfield--color">
                    <span>Color</span>
                    <div className="colorfield">
                      <input
                        className="colorfield__picker"
                        type="color"
                        value={safeColor(t.color)}
                        onChange={(e) => updateType(t.id, { color: e.target.value.toUpperCase() })}
                        aria-label={`${t.label} color`}
                      />
                      <input
                        className="colorfield__hex"
                        value={t.color}
                        onChange={(e) => updateType(t.id, { color: e.target.value.toUpperCase() })}
                        onBlur={(e) => {
                          if (!isHexColor(e.target.value.trim())) updateType(t.id, { color: "#475569" });
                        }}
                        spellCheck={false}
                      />
                    </div>
                    <div className="colorswatches" aria-label="Color presets">
                      {COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`colorswatch ${t.color.toUpperCase() === color ? "colorswatch--on" : ""}`}
                          style={{ "--swatch": color } as CSSProperties}
                          onClick={() => updateType(t.id, { color })}
                          aria-label={color}
                        />
                      ))}
                    </div>
                  </label>
                  <button className="bustype__del" onClick={() => removeType(t.id)} aria-label={`Remove ${t.label}`} title="Remove type">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="bustypes__foot">
              <button className="btn" onClick={addType}><Plus size={16} /> Add type</button>
            </div>
          </>
        )}
      </section>

      {/* ---------- Fleet ---------- */}
      <section className="adminpanel">
        <div className="adminpanel__head">
          <div>
            <h2>Fleet</h2>
            <p>Set each bus's model, type(s), Active/Retired status, and Fuel/DEF lane. A bus can be more than one type (e.g. Pulse + Hybrid).</p>
          </div>
          <div className="adminpanel__actions">
            {busSaved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
            <span className="buslist__hint">{busDirty ? "Unsaved changes" : ""}</span>
            <button className="btn" onClick={() => setCsvOpen(true)} disabled={busSaving}>Edit full list (CSV)</button>
            <button className="btn btn--primary" onClick={saveBuses} disabled={busSaving || !busDirty}>
              {busSaving ? "Saving…" : <><Save size={16} /> Save fleet</>}
            </button>
          </div>
        </div>

        <div className="adminflag__toolbar">
          <input
            className="manager__search buslist__search"
            placeholder="Search bus number, model, or name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span className="adminflag__count">{shown.length} buses</span>
        </div>

        <div className="manager__list buslist__scroll">
          {shown.length === 0 && <div className="lotlist__empty">No buses match.</div>}
          {shown.map((b) => {
            const ids = busTypeIds(b);
            return (
              <div className={`busrow ${b.status === "retired" ? "busrow--retired" : ""}`} key={b.num}>
                <div className="busrow__head">
                  <span className="busrow__num">{b.name ? `${b.name} (${b.num})` : b.num}</span>
                  <span className="busrow__preview"><CodePreview ids={ids} /></span>
                  <div className="toolbar__spacer" />
                  <label className="buslist__field">
                    <span className="buslist__fieldlabel">Status</span>
                    <select className="buslist__sel" value={b.status || "active"} onChange={(e) => updateBus(b.num, { status: e.target.value })}>
                      {BUS_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="buslist__lane" title="Included on the Fuel / DEF service-lane sheets">
                    <input
                      type="checkbox"
                      checked={!!b.lane}
                      disabled={b.status === "retired"}
                      onChange={(e) => updateBus(b.num, { lane: e.target.checked })}
                    />{" "}
                    Fuel/DEF
                  </label>
                </div>

                <label className="busrow__model">
                  <span className="buslist__fieldlabel">Model</span>
                  <input value={b.model || ""} placeholder="Model" onChange={(e) => updateBus(b.num, { model: e.target.value })} />
                </label>

                <div className="busrow__types">
                  <span className="buslist__fieldlabel">Types</span>
                  <div className="typetoggles">
                    {typeRows.map((t) => {
                      const on = ids.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`typetoggle ${on ? "typetoggle--on" : ""}`}
                          onClick={() => toggleBusType(b, t.id)}
                          aria-pressed={on}
                        >
                          {t.code && <span className="badge typetoggle__code" style={{ color: safeColor(t.color) }}>{t.code}</span>}
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
