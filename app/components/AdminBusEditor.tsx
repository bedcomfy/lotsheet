"use client";

import dynamic from "next/dynamic";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import { Check, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import {
  BUS_MODELS,
  BUS_TYPES,
  applyBusTypeConfig,
  type BusModelAdminRow,
  type BusTypeAdminRow,
  type BusTypeConfig,
} from "../lib/grid";
import {
  busModelId,
  busTypeIds,
  busWrapId,
  BUS_STATUSES,
} from "../lib/buses";
import { getDeviceActor } from "../lib/deviceActor";
import type { MasterBus } from "../lib/types";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Panel,
  ResponsiveDialog,
  SearchField,
  SelectField,
  StaticChip,
  StatusBadge,
  TextField,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import styles from "./AdminBusEditor.module.css";

const CsvEditor = dynamic(() => import("./CsvEditor"), { ssr: false });

const COLOR_PRESETS = [
  "#2563EB",
  "#15803D",
  "#B45309",
  "#0F766E",
  "#B91C1C",
  "#4B94E6",
  "#DB2777",
  "#475569",
];

const BUILTIN_TYPE_IDS = BUS_TYPES.map((type) => type.id);
const BUILTIN_MODEL_IDS = BUS_MODELS.map((model) => model.id);

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value.trim());
}

function safeColor(value: string): string {
  return isHexColor(value) ? value : "#475569";
}

function setupRowsToConfig(
  typeRows: BusTypeAdminRow[],
  modelRows: BusModelAdminRow[],
): BusTypeConfig {
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
  for (const id of BUILTIN_TYPE_IDS) {
    if (!presentTypes.has(id)) types[id] = { id, removed: true };
  }

  for (const row of modelRows) {
    models[row.id] = {
      id: row.id,
      label: row.label.trim() || row.id,
      typeId: row.typeId,
      length: row.length.trim(),
      ...(row.builtin ? {} : { custom: true }),
    };
  }
  for (const id of BUILTIN_MODEL_IDS) {
    if (!presentModels.has(id)) models[id] = { id, removed: true };
  }
  return { types, models };
}

function CodePreview({
  bus,
  modelById,
  typeById,
}: {
  bus: MasterBus;
  modelById: Record<string, BusModelAdminRow>;
  typeById: Record<string, BusTypeAdminRow>;
}) {
  const model = modelById[busModelId(bus)];
  const ids = model
    ? [busWrapId(bus), model.typeId].filter(Boolean)
    : busTypeIds(bus);
  const visible = ids.map((id) => typeById[id]).filter((type) => type?.code);
  if (!visible.length) {
    return <span className={styles.noTag}>No sheet tag</span>;
  }
  return (
    <span className={styles.preview}>
      {visible.map((type, index) => (
        <span key={type.id} className={styles.previewSegment}>
          {index > 0 && <span className={styles.previewSeparator}>/</span>}
          <span style={{ color: safeColor(type.color) }}>{type.code}</span>
        </span>
      ))}
    </span>
  );
}

const FleetRow = memo(function FleetRow({
  bus,
  modelRows,
  wrapRows,
  modelById,
  typeById,
  onUpdate,
  onAssignModel,
  onAssignWrap,
}: {
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
    <article
      className={styles.fleetRow}
      data-retired={bus.status === "retired" || undefined}
    >
      <header className={styles.fleetRowHeader}>
        <div className={styles.busIdentity}>
          <strong>{bus.name ? `${bus.name} (${bus.num})` : bus.num}</strong>
          <CodePreview
            bus={bus}
            modelById={modelById}
            typeById={typeById}
          />
        </div>
        <SelectField
          label="Status"
          className={styles.compactSelect}
          selectedKey={bus.status || "active"}
          onSelectionChange={(key) =>
            onUpdate(bus.num, { status: String(key) })
          }
          options={BUS_STATUSES}
        />
        <Checkbox
          isSelected={!!bus.lane}
          isDisabled={bus.status === "retired"}
          onChange={(selected) => onUpdate(bus.num, { lane: selected })}
        >
          Fuel/DEF
        </Checkbox>
      </header>
      <div className={styles.assignments}>
        <SelectField
          label="Model"
          placeholder="Choose model"
          selectedKey={selectedModelId || null}
          onSelectionChange={(key) => onAssignModel(bus, String(key))}
          options={modelRows.map((model) => ({
            id: model.id,
            label: model.label,
          }))}
        />
        <SelectField
          label="Wrap"
          selectedKey={busWrapId(bus)}
          onSelectionChange={(key) => onAssignWrap(bus, String(key))}
          options={wrapRows.map((wrap) => ({
            id: wrap.id,
            label: wrap.label,
          }))}
        />
      </div>
    </article>
  );
});

interface PendingConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

export default function AdminBusEditor() {
  const { master, setMaster } = useBusMaster();
  const [buses, setBuses] = useState<MasterBus[]>(() =>
    master.buses.map((bus) => ({ ...bus })),
  );
  const [filter, setFilter] = useState("");
  const [busSaving, setBusSaving] = useState(false);
  const [busDirty, setBusDirty] = useState(false);
  const [busSaved, setBusSaved] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] =
    useState<PendingConfirmation | null>(null);

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

  const modelTagRows = useMemo(
    () => typeRows.filter((row) => row.kind === "model"),
    [typeRows],
  );
  const wrapRows = useMemo(
    () => typeRows.filter((row) => row.kind === "wrap"),
    [typeRows],
  );
  const typeById = useMemo(
    () => Object.fromEntries(typeRows.map((row) => [row.id, row])),
    [typeRows],
  );
  const modelById = useMemo(
    () => Object.fromEntries(modelRows.map((row) => [row.id, row])),
    [modelRows],
  );

  const deferredFilter = useDeferredValue(filter);
  const shown = useMemo(() => {
    const query = deferredFilter.trim().toUpperCase();
    if (!query) return buses;
    return buses.filter((bus) => {
      const profile = modelById[busModelId(bus)];
      return (
        bus.num.includes(query) ||
        (profile?.label || bus.model || "").toUpperCase().includes(query) ||
        (bus.name || "").toUpperCase().includes(query)
      );
    });
  }, [buses, deferredFilter, modelById]);

  const updateBus = useCallback(
    (num: string, patch: Partial<MasterBus>) => {
      setBuses((list) =>
        list.map((bus) => (bus.num === num ? { ...bus, ...patch } : bus)),
      );
      setBusDirty(true);
      setBusSaved(false);
    },
    [],
  );

  const assignModel = useCallback(
    (bus: MasterBus, id: string) => {
      const model = modelById[id];
      const wrapId = busWrapId(bus);
      updateBus(bus.num, {
        modelId: id,
        model: model?.label || bus.model || "",
        length: model?.length || "",
        types: Array.from(
          new Set([wrapId, model?.typeId || ""].filter(Boolean)),
        ),
      });
    },
    [modelById, updateBus],
  );

  const assignWrap = useCallback(
    (bus: MasterBus, wrapId: string) => {
      const model = modelById[busModelId(bus)];
      updateBus(bus.num, {
        wrapId,
        types: Array.from(
          new Set([wrapId, model?.typeId || ""].filter(Boolean)),
        ),
      });
    },
    [modelById, updateBus],
  );

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
        setBuses(
          data.master.buses.map((bus: MasterBus) => ({ ...bus })),
        );
        setBusDirty(false);
        setBusSaved(true);
      }
    } finally {
      setBusSaving(false);
    }
  }

  function updateType(id: string, patch: Partial<BusTypeAdminRow>) {
    setTypeRows((list) =>
      list.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
    setSetupSaved(false);
  }

  function updateModel(id: string, patch: Partial<BusModelAdminRow>) {
    setModelRows((list) =>
      list.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
    setSetupSaved(false);
  }

  function addModelTag() {
    const id = `model-tag-${Date.now().toString(36)}-${addCount.current++}`;
    setTypeRows((list) => [
      ...list,
      {
        id,
        label: "New model tag",
        code: "",
        color: "#2563EB",
        kind: "model",
        builtin: false,
      },
    ]);
    setSetupSaved(false);
  }

  function requestRemoveModelTag(id: string) {
    const tag = typeRows.find((row) => row.id === id);
    const linked = modelRows.filter((model) => model.typeId === id);
    if (linked.length) {
      setNotice(
        `Reassign ${linked.length} linked model${
          linked.length === 1 ? "" : "s"
        } before removing ${tag?.label || "this tag"}.`,
      );
      return;
    }
    setConfirmation({
      title: "Remove model tag?",
      description: `"${tag?.label || id}" will no longer be available to bus models.`,
      confirmLabel: "Remove tag",
      onConfirm: () => {
        setTypeRows((list) => list.filter((row) => row.id !== id));
        setSetupSaved(false);
      },
    });
  }

  function addModel() {
    const id = `model-${Date.now().toString(36)}-${addCount.current++}`;
    setModelRows((list) => [
      ...list,
      {
        id,
        label: "New bus model",
        typeId: "",
        length: "40 feet",
        builtin: false,
      },
    ]);
    setSetupSaved(false);
  }

  function requestRemoveModel(id: string) {
    const model = modelRows.find((row) => row.id === id);
    const used = buses.filter((bus) => busModelId(bus) === id);
    if (used.length) {
      setNotice(
        `Reassign ${used.length} bus${used.length === 1 ? "" : "es"} before removing ${
          model?.label || "this model"
        }.`,
      );
      return;
    }
    setConfirmation({
      title: "Remove bus model?",
      description: `"${model?.label || id}" will no longer be available in the fleet editor.`,
      confirmLabel: "Remove model",
      onConfirm: () => {
        setModelRows((list) => list.filter((row) => row.id !== id));
        setSetupSaved(false);
      },
    });
  }

  async function saveSetup() {
    setSetupSaving(true);
    setSetupSaved(false);
    const config = setupRowsToConfig(typeRows, modelRows);
    const response = await fetch("/api/admin/bus-type-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, actor: getDeviceActor() }),
    })
      .then((result) => result.json())
      .catch(() => null);
    if (response?.config) applyBusTypeConfig(response.config);
    if (response?.types) setTypeRows(response.types);
    if (response?.models) setModelRows(response.models);
    setSetupSaving(false);
    setSetupSaved(!!response?.ok);
  }

  async function resetSetup() {
    setSetupLoaded(false);
    setSetupSaved(false);
    await fetch("/api/admin/bus-type-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: { types: {}, models: {} },
        actor: getDeviceActor(),
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        applyBusTypeConfig(data?.config || {});
        setTypeRows(data?.types || []);
        setModelRows(data?.models || []);
      })
      .finally(() => setSetupLoaded(true));
  }

  function requestReset() {
    setConfirmation({
      title: "Reset fleet setup?",
      description:
        "Model tags, wraps, and bus models will return to the built-in defaults.",
      confirmLabel: "Reset setup",
      onConfirm: resetSetup,
    });
  }

  function renderTagRows(rows: BusTypeAdminRow[], removable: boolean) {
    return (
      <div className={styles.tagRows}>
        {rows.map((row) => (
          <article className={styles.tagRow} key={row.id}>
            <div className={styles.tagPreview}>
              {row.code ? (
                <span style={{ color: safeColor(row.color) }}>{row.code}</span>
              ) : (
                <span className={styles.noTag}>No sheet tag</span>
              )}
            </div>
            <TextField
              label="Name"
              value={row.label}
              onChange={(value) => updateType(row.id, { label: value })}
            />
            <TextField
              label="Sheet text"
              value={row.code}
              placeholder="Blank means none"
              onChange={(value) => updateType(row.id, { code: value })}
            />
            <div className={styles.colorField}>
              <span className={styles.fieldLabel}>Color</span>
              <div className={styles.colorControls}>
                <input
                  className={styles.colorPicker}
                  type="color"
                  value={safeColor(row.color)}
                  onChange={(event) =>
                    updateType(row.id, {
                      color: event.target.value.toUpperCase(),
                    })
                  }
                  aria-label={`${row.label} color`}
                />
                <TextField
                  label="Hex color"
                  labelHidden
                  value={row.color}
                  onChange={(value) =>
                    updateType(row.id, { color: value.toUpperCase() })
                  }
                  onBlur={() => {
                    if (!isHexColor(row.color)) {
                      updateType(row.id, { color: "#475569" });
                    }
                  }}
                />
              </div>
              <div className={styles.swatches} aria-label="Color presets">
                {COLOR_PRESETS.map((color) => (
                  <AriaButton
                    key={color}
                    className={styles.swatch}
                    data-selected={
                      row.color.toUpperCase() === color || undefined
                    }
                    style={{ "--swatch": color } as CSSProperties}
                    onPress={() => updateType(row.id, { color })}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>
            {removable ? (
              <IconButton
                variant="quiet"
                aria-label={`Remove ${row.label}`}
                onPress={() => requestRemoveModelTag(row.id)}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            ) : (
              <span />
            )}
          </article>
        ))}
      </div>
    );
  }

  if (csvOpen) {
    return (
      <CsvEditor
        onClose={() => setCsvOpen(false)}
        onSaved={async () => {
          const data = await fetch("/api/buses")
            .then((response) => response.json())
            .catch(() => null);
          if (data?.master) {
            setMaster(data.master);
            setBuses(
              data.master.buses.map((bus: MasterBus) => ({ ...bus })),
            );
          }
          setCsvOpen(false);
        }}
      />
    );
  }

  return (
    <>
      <Panel
        title="Fleet setup"
        description="Models inherit one editable sheet tag. Wraps are assigned separately, and visible tags remain separated by a forward slash."
        bodyClassName={styles.setupBody}
        actions={
          <>
            {setupSaved && (
              <StatusBadge tone="success">
                <Check aria-hidden="true" /> Saved
              </StatusBadge>
            )}
            <Button
              variant="secondary"
              onPress={requestReset}
              isDisabled={setupSaving}
            >
              <RotateCcw aria-hidden="true" /> Reset
            </Button>
            <Button
              variant="primary"
              onPress={saveSetup}
              isDisabled={setupSaving || !setupLoaded}
            >
              <Save aria-hidden="true" />{" "}
              {setupSaving ? "Saving..." : "Save setup"}
            </Button>
          </>
        }
      >
        {!setupLoaded ? (
          <EmptyState kind="loading" title="Loading fleet setup" />
        ) : (
          <div className={styles.setup}>
            <section className={styles.setupSection}>
              <header className={styles.sectionHeader}>
                <div>
                  <h3>Model tags</h3>
                  <p>Inherited from a bus model, such as HEV, 30&apos;, or COACH.</p>
                </div>
                <Button variant="secondary" onPress={addModelTag}>
                  <Plus aria-hidden="true" /> Add tag
                </Button>
              </header>
              {renderTagRows(modelTagRows, true)}
            </section>

            <section className={styles.setupSection}>
              <header className={styles.sectionHeader}>
                <div>
                  <h3>Wraps</h3>
                  <p>Applied over the model. Standard stays blank; Pulse shows P.</p>
                </div>
              </header>
              {renderTagRows(wrapRows, false)}
            </section>

            <section className={styles.setupSection}>
              <header className={styles.sectionHeader}>
                <div>
                  <h3>Bus models</h3>
                  <p>Each model controls the sheet tag inherited by linked buses.</p>
                </div>
                <Button variant="secondary" onPress={addModel}>
                  <Plus aria-hidden="true" /> Add model
                </Button>
              </header>
              <div className={styles.modelRows}>
                {modelRows.map((model) => (
                  <article className={styles.modelRow} key={model.id}>
                    <TextField
                      label="Model name"
                      value={model.label}
                      onChange={(value) =>
                        updateModel(model.id, { label: value })
                      }
                    />
                    <SelectField
                      label="Model tag"
                      placeholder="No model tag"
                      selectedKey={model.typeId || null}
                      onSelectionChange={(key) =>
                        updateModel(model.id, { typeId: String(key) })
                      }
                      options={modelTagRows.map((tag) => ({
                        id: tag.id,
                        label: tag.label,
                        description: tag.code || "No sheet text",
                      }))}
                    />
                    <TextField
                      label="Length"
                      value={model.length}
                      placeholder="40 feet"
                      onChange={(value) =>
                        updateModel(model.id, { length: value })
                      }
                    />
                    <IconButton
                      variant="quiet"
                      aria-label={`Remove ${model.label}`}
                      onPress={() => requestRemoveModel(model.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </Panel>

      <Panel
        title="Fleet"
        description="Assign each bus a model and wrap. The inherited model tag updates automatically."
        bodyClassName={styles.fleetBody}
        actions={
          <>
            {busSaved && (
              <StatusBadge tone="success">
                <Check aria-hidden="true" /> Saved
              </StatusBadge>
            )}
            {busDirty && <StaticChip tone="warning">Unsaved changes</StaticChip>}
            <Button
              variant="secondary"
              onPress={() => setCsvOpen(true)}
              isDisabled={busSaving}
            >
              Edit full list (CSV)
            </Button>
            <Button
              variant="primary"
              onPress={saveBuses}
              isDisabled={busSaving || !busDirty}
            >
              <Save aria-hidden="true" />{" "}
              {busSaving ? "Saving..." : "Save fleet"}
            </Button>
          </>
        }
      >
        <div className={styles.fleetToolbar}>
          <SearchField
            label="Search fleet"
            labelHidden
            placeholder="Search bus number, model, or name"
            value={filter}
            onChange={setFilter}
          />
          <span className={styles.count}>{shown.length} buses</span>
        </div>
        <div className={styles.fleetList}>
          {!shown.length && (
            <EmptyState
              title="No matching buses"
              description="Try another bus number, model, or fleet name."
            />
          )}
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
      </Panel>

      <ConfirmDialog
        isOpen={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={confirmation?.title ?? "Confirm change"}
        description={confirmation?.description ?? ""}
        confirmLabel={confirmation?.confirmLabel}
        tone="danger"
        onConfirm={async () => {
          await confirmation?.onConfirm();
          setConfirmation(null);
        }}
      />

      <ResponsiveDialog
        isOpen={!!notice}
        onOpenChange={(open) => {
          if (!open) setNotice("");
        }}
        title="This item is still in use"
        size="sm"
        footer={(close) => (
          <Button variant="primary" onPress={close}>
            Done
          </Button>
        )}
      >
        <p className={styles.notice}>{notice}</p>
      </ResponsiveDialog>
    </>
  );
}
