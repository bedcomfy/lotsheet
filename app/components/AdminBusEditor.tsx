"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  BUS_MODELS,
  BUS_TYPES,
  applyBusTypeConfig,
  type BusModelAdminRow,
  type BusTypeAdminRow,
  type BusTypeConfig,
} from "../lib/grid";
import { busModelId, busTypeIds, busWrapId, BUS_STATUSES } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import dynamic from "next/dynamic";
// Loads on first "Edit full list (CSV)" tap, not with the page.
const CsvEditor = dynamic(() => import("./CsvEditor"), { ssr: false });
import { getDeviceActor } from "../lib/deviceActor";
import type { MasterBus } from "../lib/types";

const COLOR_PRESETS = ["#7C3AED", "#15803D", "#B45309", "#0F766E", "#B91C1C", "#2563EB", "#DB2777", "#475569"];
const BUILTIN_TYPE_IDS = BUS_TYPES.map((type) => type.id);
const BUILTIN_MODEL_IDS = BUS_MODELS.map((model) => model.id);

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value.trim());
}

function safeColor(value: string): string {
  return isHexColor(value) ? value : "#475569";
}

function setupRowsToConfig(typeRows: BusTypeAdminRow[], modelRows: BusModelAdminRow[]): BusTypeConfig {
  const types: BusTypeConfig["types"] = {};
  const models: BusTypeConfig["models"] = {};
  const presentTypes = new Set(typeRows.map((row) => row.id));
  const presentModels = new Set(modelRows.map((row) => row.id));

  for (const row of typeRows) {
    types[row.id] = {
      id: row.id,
      label: row.label.trim() || row.id,
      code: row.code.trim(),
      color: row.color,
      kind: row.kind,
      ...(row.builtin ? {} : { custom: true }),
    };
  }
  for (const id of BUILTIN_TYPE_IDS) if (!presentTypes.has(id)) types[id] = { id, removed: true };

  for (const row of modelRows) {
    models[row.id] = {
      id: row.id,
      label: row.label.trim() || row.id,
      typeId: row.typeId,
      length: row.length.trim(),
      ...(row.builtin ? {} : { custom: true }),
    };
  }
  for (const id of BUILTIN_MODEL_IDS) if (!presentModels.has(id)) models[id] = { id, removed: true };
  return { types, models };
}

function CodePreview({ bus, modelById, typeById }: {
  bus: MasterBus;
  modelById: Record<string, BusModelAdminRow>;
  typeById: Record<string, BusTypeAdminRow>;
}) {
  const model = modelById[busModelId(bus)];
  const ids = model ? [busWrapId(bus), model.typeId].filter(Boolean) : busTypeIds(bus);
  const visible = ids.map((id) => typeById[id]).filter((type) => type?.code);
  if (!visible.length) return <span className="busprev busprev--none">no sheet tag</span>;
  return (
    <span className="busprev">
      {visible.map((type, index) => (
        <span key={type.id} className="busprev__seg">
          {index > 0 && <span className="busprev__sep">/</span>}
          <span className="badge" style={{ color: safeColor(type.color) }}>{type.code}</span>
        </span>
      ))}
    </span>
  );
}

// One bus row, memoized: with 130+ rows each holding two <select>s (a dozen+
// options apiece), re-rendering the whole list on every filter keystroke or
// single-row edit is what made this page feel slow. All callbacks are stable
// (useCallback in the parent), so a row only re-renders when ITS bus changes.
const FleetRow = memo(function FleetRow({ bus, modelRows, wrapRows, modelById, typeById, onUpdate, onAssignModel, onAssignWrap }: {
  bus: MasterBus;
  modelRows: BusModelAdminRow[];
  wrapRows: BusTypeAdminRow[];
  modelById: Record<string, BusModelAdminRow>;
  typeById: Record<string, BusTypeAdminRow>;
  onUpdate: (num: string, patch: Partial<MasterBus>) => void;
  onAssignModel: (bus: MasterBus, id: string) => void;
  onAssignWrap: (bus: MasterBus, wrapId: string) => void;
}) {
  const selectedModelId = busModelId(bus);
  return (
    <div className={`fleetrow ${bus.status === "retired" ? "fleetrow--retired" : ""}`}>
      <div className="fleetrow__head">
        <span className="fleetrow__num">{bus.name ? `${bus.name} (${bus.num})` : bus.num}</span>
        <span className="fleetrow__preview"><CodePreview bus={bus} modelById={modelById} typeById={typeById} /></span>
        <div className="toolbar__spacer" />
        <label className="buslist__field"><span className="buslist__fieldlabel">Status</span>
          <select className="buslist__sel" value={bus.status || "active"} onChange={(event) => onUpdate(bus.num, { status: event.target.value })}>
            {BUS_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
          </select></label>
        <label className="buslist__lane" title="Included on the Fuel / DEF service-lane sheets">
          <input type="checkbox" checked={!!bus.lane} disabled={bus.status === "retired"}
            onChange={(event) => onUpdate(bus.num, { lane: event.target.checked })} /> Fuel/DEF
        </label>
      </div>
      <div className="fleetrow__assignments">
        <label className="buslist__field"><span className="buslist__fieldlabel">Model</span>
          <select className="buslist__typesel" value={selectedModelId} onChange={(event) => onAssignModel(bus, event.target.value)}>
            {!selectedModelId && <option value="">Choose model</option>}
            {modelRows.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select></label>
        <label className="buslist__field"><span className="buslist__fieldlabel">Wrap</span>
          <select className="buslist__typesel" value={busWrapId(bus)} onChange={(event) => onAssignWrap(bus, event.target.value)}>
            {wrapRows.map((wrap) => <option key={wrap.id} value={wrap.id}>{wrap.label}</option>)}
          </select></label>
      </div>
    </div>
  );
});

export default function AdminBusEditor() {
  const { master, setMaster } = useBusMaster();
  const [buses, setBuses] = useState<MasterBus[]>(() => master.buses.map((bus) => ({ ...bus })));
  const [filter, setFilter] = useState("");
  const [busSaving, setBusSaving] = useState(false);
  const [busDirty, setBusDirty] = useState(false);
  const [busSaved, setBusSaved] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const [typeRows, setTypeRows] = useState<BusTypeAdminRow[]>([]);
  const [modelRows, setModelRows] = useState<BusModelAdminRow[]>([]);
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupSaved, setSetupSaved] = useState(false);
  const addCount = useRef(0);

  useEffect(() => {
    fetch("/api/admin/bus-type-config")
      .then((response) => response.json())
      .then((data) => {
        applyBusTypeConfig(data?.config || {});
        setTypeRows(data?.types || []);
        setModelRows(data?.models || []);
      })
      .catch(() => {})
      .finally(() => setSetupLoaded(true));
  }, []);

  const modelTagRows = useMemo(() => typeRows.filter((row) => row.kind === "model"), [typeRows]);
  const wrapRows = useMemo(() => typeRows.filter((row) => row.kind === "wrap"), [typeRows]);
  const typeById = useMemo(() => Object.fromEntries(typeRows.map((row) => [row.id, row])), [typeRows]);
  const modelById = useMemo(() => Object.fromEntries(modelRows.map((row) => [row.id, row])), [modelRows]);

  // Deferred: the search box repaints on every keystroke; re-filtering the
  // 130-row list (DOM mount/unmount) happens async so typing never stutters.
  const deferredFilter = useDeferredValue(filter);
  const shown = useMemo(() => {
    const query = deferredFilter.trim().toUpperCase();
    if (!query) return buses;
    return buses.filter((bus) => {
      const profile = modelById[busModelId(bus)];
      return bus.num.includes(query) || (profile?.label || bus.model || "").toUpperCase().includes(query) ||
        (bus.name || "").toUpperCase().includes(query);
    });
  }, [buses, deferredFilter, modelById]);

  // Stable callbacks (identity only changes when modelById does) so the
  // memoized FleetRow actually skips re-renders.
  const updateBus = useCallback((num: string, patch: Partial<MasterBus>) => {
    setBuses((list) => list.map((bus) => (bus.num === num ? { ...bus, ...patch } : bus)));
    setBusDirty(true);
    setBusSaved(false);
  }, []);

  const assignModel = useCallback((bus: MasterBus, id: string) => {
    const model = modelById[id];
    const wrapId = busWrapId(bus);
    updateBus(bus.num, {
      modelId: id,
      model: model?.label || bus.model || "",
      length: model?.length || "",
      types: Array.from(new Set([wrapId, model?.typeId || ""].filter(Boolean))),
    });
  }, [modelById, updateBus]);

  const assignWrap = useCallback((bus: MasterBus, wrapId: string) => {
    const model = modelById[busModelId(bus)];
    updateBus(bus.num, {
      wrapId,
      types: Array.from(new Set([wrapId, model?.typeId || ""].filter(Boolean))),
    });
  }, [modelById, updateBus]);

  async function saveBuses() {
    setBusSaving(true);
    try {
      const response = await fetch("/api/buses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master: { buses } }),
      });
      const data = await response.json().catch(() => ({}));
      if (data?.master) {
        setMaster(data.master);
        setBuses(data.master.buses.map((bus: MasterBus) => ({ ...bus })));
        setBusDirty(false);
        setBusSaved(true);
      }
    } finally {
      setBusSaving(false);
    }
  }

  function updateType(id: string, patch: Partial<BusTypeAdminRow>) {
    setTypeRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setSetupSaved(false);
  }

  function updateModel(id: string, patch: Partial<BusModelAdminRow>) {
    setModelRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setSetupSaved(false);
  }

  function addModelTag() {
    const id = `model-tag-${Date.now().toString(36)}-${addCount.current++}`;
    setTypeRows((list) => [...list, { id, label: "New model tag", code: "", color: "#2563EB", kind: "model", builtin: false }]);
    setSetupSaved(false);
  }

  function removeModelTag(id: string) {
    const tag = typeRows.find((row) => row.id === id);
    const linked = modelRows.filter((model) => model.typeId === id);
    if (linked.length) {
      window.alert(`Reassign ${linked.length} linked model${linked.length === 1 ? "" : "s"} before removing ${tag?.label || "this tag"}.`);
      return;
    }
    if (!window.confirm(`Remove the model tag "${tag?.label || id}"?`)) return;
    setTypeRows((list) => list.filter((row) => row.id !== id));
    setSetupSaved(false);
  }

  function addModel() {
    const id = `model-${Date.now().toString(36)}-${addCount.current++}`;
    setModelRows((list) => [...list, { id, label: "New bus model", typeId: "", length: "40 feet", builtin: false }]);
    setSetupSaved(false);
  }

  function removeModel(id: string) {
    const model = modelRows.find((row) => row.id === id);
    const used = buses.filter((bus) => busModelId(bus) === id);
    if (used.length) {
      window.alert(`Reassign ${used.length} bus${used.length === 1 ? "" : "es"} before removing ${model?.label || "this model"}.`);
      return;
    }
    if (!window.confirm(`Remove the bus model "${model?.label || id}"?`)) return;
    setModelRows((list) => list.filter((row) => row.id !== id));
    setSetupSaved(false);
  }

  async function saveSetup() {
    setSetupSaving(true);
    setSetupSaved(false);
    const config = setupRowsToConfig(typeRows, modelRows);
    const response = await fetch("/api/admin/bus-type-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, actor: getDeviceActor() }),
    }).then((result) => result.json()).catch(() => null);
    if (response?.config) applyBusTypeConfig(response.config);
    if (response?.types) setTypeRows(response.types);
    if (response?.models) setModelRows(response.models);
    setSetupSaving(false);
    setSetupSaved(!!response?.ok);
  }

  async function resetSetup() {
    if (!window.confirm("Reset model tags, wraps, and bus models to the built-in defaults?")) return;
    setSetupLoaded(false);
    setSetupSaved(false);
    await fetch("/api/admin/bus-type-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { types: {}, models: {} }, actor: getDeviceActor() }),
    })
      .then((response) => response.json())
      .then((data) => {
        applyBusTypeConfig(data?.config || {});
        setTypeRows(data?.types || []);
        setModelRows(data?.models || []);
      })
      .finally(() => setSetupLoaded(true));
  }

  function renderTagRows(rows: BusTypeAdminRow[], removable: boolean) {
    return (
      <div className="bustypes">
        {rows.map((row) => (
          <div className="bustype" key={row.id}>
            <div className="bustype__preview">
              {row.code ? <span className="badge bustype__badge" style={{ color: safeColor(row.color) }}>{row.code}</span> :
                <span className="bustype__badge bustype__badge--none">no badge</span>}
            </div>
            <label className="adminfield">
              <span>Name</span>
              <input value={row.label} onChange={(event) => updateType(row.id, { label: event.target.value })} />
            </label>
            <label className="adminfield">
              <span>Sheet text</span>
              <input value={row.code} placeholder="(blank = none)" onChange={(event) => updateType(row.id, { code: event.target.value })} />
            </label>
            <label className="adminfield adminfield--color">
              <span>Color</span>
              <div className="colorfield">
                <input className="colorfield__picker" type="color" value={safeColor(row.color)}
                  onChange={(event) => updateType(row.id, { color: event.target.value.toUpperCase() })} aria-label={`${row.label} color`} />
                <input className="colorfield__hex" value={row.color}
                  onChange={(event) => updateType(row.id, { color: event.target.value.toUpperCase() })}
                  onBlur={(event) => !isHexColor(event.target.value) && updateType(row.id, { color: "#475569" })} spellCheck={false} />
              </div>
              <div className="colorswatches" aria-label="Color presets">
                {COLOR_PRESETS.map((color) => (
                  <button key={color} type="button" className={`colorswatch ${row.color.toUpperCase() === color ? "colorswatch--on" : ""}`}
                    style={{ "--swatch": color } as CSSProperties} onClick={() => updateType(row.id, { color })} aria-label={color} />
                ))}
              </div>
            </label>
            {removable ? (
              <button className="bustype__del" onClick={() => removeModelTag(row.id)} aria-label={`Remove ${row.label}`} title="Remove tag">
                <Trash2 size={16} />
              </button>
            ) : <span />}
          </div>
        ))}
      </div>
    );
  }

  if (csvOpen) {
    return (
      <CsvEditor onClose={() => setCsvOpen(false)} onSaved={async () => {
        const data = await fetch("/api/buses").then((response) => response.json()).catch(() => null);
        if (data?.master) {
          setMaster(data.master);
          setBuses(data.master.buses.map((bus: MasterBus) => ({ ...bus })));
        }
        setCsvOpen(false);
      }} />
    );
  }

  return (
    <>
      <section className="adminpanel">
        <div className="adminpanel__head">
          <div>
            <h2>Fleet setup</h2>
            <p>Models inherit one editable sheet tag. Wraps are assigned separately, and visible tags stay separated by a forward slash.</p>
          </div>
          <div className="adminpanel__actions">
            {setupSaved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
            <button className="btn" onClick={resetSetup} disabled={setupSaving}><RotateCcw size={16} /> Reset</button>
            <button className="btn btn--primary" onClick={saveSetup} disabled={setupSaving || !setupLoaded}>
              {setupSaving ? "Saving..." : <><Save size={16} /> Save setup</>}
            </button>
          </div>
        </div>

        {!setupLoaded && <div className="lotlist__empty">Loading fleet setup...</div>}
        {setupLoaded && (
          <div className="fleetsetup">
            <section className="fleetsetup__section">
              <div className="fleetsetup__head"><div><h3>Model tags</h3><p>Inherited from a bus model, such as HEV, 30', or COACH.</p></div>
                <button className="btn" onClick={addModelTag}><Plus size={16} /> Add tag</button></div>
              {renderTagRows(modelTagRows, true)}
            </section>

            <section className="fleetsetup__section">
              <div className="fleetsetup__head"><div><h3>Wraps</h3><p>Applied on top of the model. Standard stays blank; Pulse continues to show P.</p></div></div>
              {renderTagRows(wrapRows, false)}
            </section>

            <section className="fleetsetup__section">
              <div className="fleetsetup__head"><div><h3>Bus models</h3><p>Each model controls the model tag inherited by every linked bus.</p></div>
                <button className="btn" onClick={addModel}><Plus size={16} /> Add model</button></div>
              <div className="busmodels">
                {modelRows.map((model) => (
                  <div className="busmodel" key={model.id}>
                    <label className="adminfield"><span>Model name</span><input value={model.label}
                      onChange={(event) => updateModel(model.id, { label: event.target.value })} /></label>
                    <label className="adminfield"><span>Model tag</span><select value={model.typeId}
                      onChange={(event) => updateModel(model.id, { typeId: event.target.value })}>
                      <option value="">No model tag</option>
                      {modelTagRows.map((tag) => <option key={tag.id} value={tag.id}>{tag.label} ({tag.code || "no sheet text"})</option>)}
                    </select></label>
                    <label className="adminfield"><span>Length</span><input value={model.length} placeholder="40 feet"
                      onChange={(event) => updateModel(model.id, { length: event.target.value })} /></label>
                    <button className="bustype__del" onClick={() => removeModel(model.id)} aria-label={`Remove ${model.label}`} title="Remove model"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>

      <section className="adminpanel">
        <div className="adminpanel__head">
          <div><h2>Fleet</h2><p>Assign each bus a model and a wrap. The inherited model tag updates automatically.</p></div>
          <div className="adminpanel__actions">
            {busSaved && <span className="adminflag__saved"><Check size={15} /> Saved</span>}
            <span className="buslist__hint">{busDirty ? "Unsaved changes" : ""}</span>
            <button className="btn" onClick={() => setCsvOpen(true)} disabled={busSaving}>Edit full list (CSV)</button>
            <button className="btn btn--primary" onClick={saveBuses} disabled={busSaving || !busDirty}>
              {busSaving ? "Saving..." : <><Save size={16} /> Save fleet</>}
            </button>
          </div>
        </div>

        <div className="adminflag__toolbar">
          <input className="manager__search buslist__search" placeholder="Search bus number, model, or name..." value={filter}
            onChange={(event) => setFilter(event.target.value)} />
          <span className="adminflag__count">{shown.length} buses</span>
        </div>

        <div className="manager__list buslist__scroll">
          {!shown.length && <div className="lotlist__empty">No buses match.</div>}
          {shown.map((bus) => (
            <FleetRow
              key={bus.num}
              bus={bus}
              modelRows={modelRows}
              wrapRows={wrapRows}
              modelById={modelById}
              typeById={typeById}
              onUpdate={updateBus}
              onAssignModel={assignModel}
              onAssignWrap={assignWrap}
            />
          ))}
        </div>
      </section>
    </>
  );
}
