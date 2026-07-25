"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import {
  applyFlagConfig,
  editableFlagRows,
  type FlagAdminRow,
  type FlagConfig,
  type FlagConfigEntry,
  type FlagTier,
} from "../lib/grid";
import { getDeviceActor } from "../lib/deviceActor";
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  EmptyState,
  Panel,
  SearchField,
  SelectField,
  StaticChip,
  StatusBadge,
  TextField,
} from "../ui";
import ObjectCodePicker from "./ObjectCodePicker";
import styles from "./AdminFlagEditor.module.css";

const TIERS: { id: FlagTier; label: string }[] = [
  { id: "high", label: "High (red)" },
  { id: "med", label: "Medium (amber)" },
  { id: "low", label: "Low (blue)" },
];

const TIER_SHORT: Record<FlagTier, string> = {
  high: "High",
  med: "Medium",
  low: "Low",
};

const COLOR_PRESETS = [
  "#2563EB",
  "#0F766E",
  "#15803D",
  "#7C3AED",
  "#D97706",
  "#DC2626",
  "#DB2777",
  "#475569",
];

const DEPTS = [
  { id: "service", label: "Service" },
  { id: "maintenance", label: "Maintenance" },
  { id: "safety", label: "Safety" },
];

const DEPT_LABEL: Record<string, string> = Object.fromEntries(
  DEPTS.map((department) => [department.id, department.label]),
);

const DEFAULT_FLAG_ROWS = new Map(
  editableFlagRows({ flags: {} }).map((row) => [row.id, row]),
);

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
    const unchanged =
      !!base &&
      row.name === base.name &&
      row.label === base.label &&
      row.tier === base.tier &&
      row.color === base.color &&
      row.quick === base.quick &&
      row.alwaysPrint === base.alwaysPrint &&
      row.department === base.department &&
      row.active === base.active &&
      row.aliases.join("\u0000") === base.aliases.join("\u0000") &&
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
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/flag-config")
      .then((response) => response.json())
      .then((data) => {
        applyFlagConfig(data?.config || {});
        setRows(data?.flags || []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

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

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  function update(id: string, patch: Partial<FlagAdminRow>) {
    setSaved(false);
    setRows((list) =>
      list.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const config = rowsToConfig(rows);
    const result = await fetch("/api/admin/flag-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, actor: getDeviceActor() }),
    })
      .then((response) => response.json())
      .catch(() => null);
    if (result?.config) applyFlagConfig(result.config);
    if (result?.flags) setRows(result.flags);
    setSaving(false);
    setSaved(!!result?.ok);
  }

  async function reloadDefaults() {
    setLoaded(false);
    setSaved(false);
    await fetch("/api/admin/flag-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: { flags: {} },
        actor: getDeviceActor(),
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        applyFlagConfig(data?.config || {});
        setRows(data?.flags || []);
      })
      .finally(() => setLoaded(true));
  }

  return (
    <>
      <Panel
        title="Flag Editor"
        description="Choose a flag to edit its appearance and behavior. Stable flag IDs keep existing bus data intact."
        bodyClassName={styles.body}
        actions={
          <>
            {saved && (
              <StatusBadge tone="success">
                <Check aria-hidden="true" /> Saved
              </StatusBadge>
            )}
            <Button
              variant="secondary"
              onPress={() => setResetOpen(true)}
              isDisabled={saving}
            >
              <RotateCcw aria-hidden="true" /> Reset
            </Button>
            <Button
              variant="primary"
              onPress={save}
              isDisabled={saving || !loaded}
            >
              <Save aria-hidden="true" /> {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        {!loaded ? (
          <EmptyState
            kind="loading"
            title="Loading flags"
            description="Preparing daily and object-code flag settings."
          />
        ) : (
          <div
            className={`${styles.editor} ${
              selectedId ? styles.editorDetail : ""
            }`}
          >
            <aside className={styles.listPane}>
              <div className={styles.listTools}>
                <SearchField
                  label="Search flags"
                  labelHidden
                  placeholder="Search flags, aliases, or codes"
                  value={query}
                  onChange={setQuery}
                />
                <div className={styles.filters} aria-label="Flag groups">
                  {(
                    [
                      ["all", "All"],
                      ["daily", "Daily flags"],
                      ["object", "Object codes"],
                    ] as const
                  ).map(([id, label]) => (
                    <Chip
                      key={id}
                      isSelected={scope === id}
                      onPress={() => setScope(id)}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
                <span className={styles.count}>
                  {shown.length} flag{shown.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className={styles.rows}>
                {shown.length === 0 && (
                  <EmptyState
                    title="No matching flags"
                    description="Try another name, alias, or object code."
                  />
                )}
                {shown.map((row) => (
                  <AriaButton
                    key={row.id}
                    className={styles.row}
                    data-selected={row.id === selectedId || undefined}
                    data-inactive={!row.active || undefined}
                    onPress={() => setSelectedId(row.id)}
                  >
                    <span
                      className={styles.dot}
                      style={{ background: safeColor(row.color) }}
                    />
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle}>
                        {row.name || row.id}
                        {!row.active && <StaticChip>Hidden</StaticChip>}
                        {row.quick && (
                          <StaticChip tone="accent">Quick</StaticChip>
                        )}
                        {row.objectCode && <StaticChip>Object code</StaticChip>}
                      </span>
                      <span className={styles.rowMeta}>
                        <span style={{ color: safeColor(row.color) }}>
                          {row.label || row.id}
                        </span>
                        <span>{DEPT_LABEL[row.department] || row.department}</span>
                        <span>{TIER_SHORT[row.tier]}</span>
                        {row.objectCodes.length > 0 && (
                          <span>
                            {row.objectCodes.length} code
                            {row.objectCodes.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight className={styles.chevron} aria-hidden="true" />
                  </AriaButton>
                ))}
              </div>
            </aside>

            <section className={styles.detailPane}>
              {!selected && (
                <EmptyState
                  title="Select a flag"
                  description="Its label, color, search aliases, object codes, and sheet behavior will appear here."
                />
              )}
              {selected && (
                <div className={styles.detail} key={selected.id}>
                  <header className={styles.detailHeader}>
                    <Button
                      className={styles.back}
                      variant="quiet"
                      onPress={() => setSelectedId(null)}
                    >
                      <ChevronLeft aria-hidden="true" /> Flags
                    </Button>
                    <span
                      className={styles.previewChip}
                      style={
                        {
                          "--flag-color": safeColor(selected.color),
                        } as CSSProperties
                      }
                    >
                      {selected.label || selected.id}
                    </span>
                    <code className={styles.id}>{selected.id}</code>
                  </header>

                  <div className={styles.formGrid}>
                    <TextField
                      label="Name in menus"
                      value={selected.name}
                      onChange={(value) =>
                        update(selected.id, { name: value })
                      }
                    />
                    <TextField
                      label="Printed sheet code"
                      value={selected.label}
                      onChange={(value) =>
                        update(selected.id, { label: value })
                      }
                    />

                    <div className={styles.colorField}>
                      <span className={styles.fieldLabel}>Color</span>
                      <div className={styles.colorControls}>
                        <input
                          className={styles.colorPicker}
                          type="color"
                          value={safeColor(selected.color)}
                          onChange={(event) =>
                            update(selected.id, {
                              color: event.target.value.toUpperCase(),
                            })
                          }
                          aria-label={`${selected.name} color`}
                        />
                        <TextField
                          label="Hex color"
                          labelHidden
                          value={selected.color}
                          onChange={(value) =>
                            update(selected.id, {
                              color: value.toUpperCase(),
                            })
                          }
                          onBlur={(event) => {
                            if (!isHexColor(event.currentTarget.value.trim())) {
                              update(selected.id, { color: "#2563EB" });
                            }
                          }}
                        />
                      </div>
                      <div
                        className={styles.swatches}
                        aria-label="Color presets"
                      >
                        {COLOR_PRESETS.map((color) => (
                          <AriaButton
                            key={color}
                            className={styles.swatch}
                            data-selected={
                              selected.color.toUpperCase() === color || undefined
                            }
                            style={{ "--swatch": color } as CSSProperties}
                            onPress={() => update(selected.id, { color })}
                            aria-label={color}
                          />
                        ))}
                      </div>
                    </div>

                    <SelectField
                      label="Priority"
                      selectedKey={selected.tier}
                      onSelectionChange={(key) =>
                        update(selected.id, { tier: key as FlagTier })
                      }
                      options={TIERS}
                    />
                    <SelectField
                      label="Department"
                      selectedKey={selected.department}
                      onSelectionChange={(key) =>
                        update(selected.id, { department: String(key) })
                      }
                      options={DEPTS}
                    />

                    <div className={styles.wide}>
                      {selected.objectCode ? (
                        <TextField
                          label="Object code"
                          value={
                            selected.objectCodes[0] || selected.label
                          }
                          isReadOnly
                        />
                      ) : (
                        <div className={styles.customField}>
                          <span className={styles.fieldLabel}>Object codes</span>
                          <ObjectCodePicker
                            value={selected.objectCodes}
                            onChange={(codes) =>
                              update(selected.id, { objectCodes: codes })
                            }
                          />
                        </div>
                      )}
                    </div>

                    <TextField
                      className={styles.wide}
                      label="Search aliases"
                      description="Separate aliases with commas."
                      value={selected.aliases.join(", ")}
                      onChange={(value) =>
                        update(selected.id, { aliases: splitWords(value) })
                      }
                      placeholder="air conditioning, climate, cold"
                    />

                    <div className={`${styles.checks} ${styles.wide}`}>
                      <Checkbox
                        isSelected={selected.quick}
                        onChange={(value) =>
                          update(selected.id, { quick: value })
                        }
                        description="Show this flag among the fast-access chips."
                      >
                        Quick chip
                      </Checkbox>
                      <Checkbox
                        isSelected={selected.alwaysPrint}
                        onChange={(value) =>
                          update(selected.id, { alwaysPrint: value })
                        }
                        description="Include the marker anywhere this bus is printed."
                      >
                        Always print
                      </Checkbox>
                      <Checkbox
                        isSelected={selected.active}
                        onChange={(value) =>
                          update(selected.id, { active: value })
                        }
                        description="Allow the flag to appear in editing menus."
                      >
                        Active
                      </Checkbox>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        isOpen={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset flag settings?"
        description="All display overrides will return to the built-in defaults. Existing bus flags will remain linked to their stable IDs."
        confirmLabel="Reset settings"
        tone="danger"
        onConfirm={reloadDefaults}
      />
    </>
  );
}
