"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Lock,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { Employee } from "../lib/types";
import { UNAVAILABLE_REASONS } from "../lib/staffing";
import { useEmployees } from "../lib/queries";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import {
  Button,
  DataTableFrame,
  EmptyState,
  IconButton,
  Panel,
  SearchField,
  SelectField,
  StatusBadge,
  TextField,
} from "../ui";
import AdminUnlockButton from "./AdminUnlockButton";
import { SkeletonRows } from "./Skeleton";
import styles from "./SeniorityPage.module.css";

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

const EMPTY: Employee = {
  firstName: "",
  lastName: "",
  badge: "",
  startDate: "",
  hireDate: "",
  classification: "",
  availability: "",
};

type SortKey =
  | "firstName"
  | "lastName"
  | "badge"
  | "startDate"
  | "hireDate"
  | "classification";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "classification", label: "Classification" },
  { key: "startDate", label: "Shop seniority" },
  { key: "hireDate", label: "Pace hire date" },
  { key: "badge", label: "Employee ID" },
];

function fmtDate(iso: string): string {
  if (!iso) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
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
      setLoaded(true);
    }
  }, [isSuccess, isError, employees]);

  function setRow(index: number, key: keyof Employee, value: string) {
    setSaved(false);
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  }

  function removeRow(index: number) {
    setSaved(false);
    setRows((current) =>
      current.filter((_, rowIndex) => rowIndex !== index),
    );
  }

  function addRow() {
    setSaved(false);
    setRows((current) => [...current, { ...EMPTY }]);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const clean = rows.filter(
      (row) =>
        row.firstName.trim() || row.lastName.trim() || row.badge.trim(),
    );
    const result = await fetch("/api/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: clean }),
    })
      .then((response) => response.json())
      .catch(() => null);
    setSaving(false);
    if (result?.ok) {
      setRows((result.employees || []).map(normalize));
      setSaved(true);
    }
  }

  const q = query.trim().toLowerCase();
  function chooseSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function SortIcon({ field }: { field: SortKey }) {
    if (sortKey !== field) return <ArrowUpDown aria-hidden="true" />;
    return sortDirection === "asc" ? (
      <ArrowUp aria-hidden="true" />
    ) : (
      <ArrowDown aria-hidden="true" />
    );
  }

  const shown = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !q ||
        row.firstName.toLowerCase().includes(q) ||
        row.lastName.toLowerCase().includes(q) ||
        row.badge.toLowerCase().includes(q) ||
        row.classification.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const aValue = String(a.row[sortKey] || "").trim();
      const bValue = String(b.row[sortKey] || "").trim();
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      const order = aValue.localeCompare(bValue, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDirection === "asc" ? order : -order;
    });

  const sortHeader = (
    <div className={styles.headerRow}>
      {SORT_OPTIONS.map((option) => (
        <AriaButton
          className={styles.sortButton}
          data-active={sortKey === option.key || undefined}
          onPress={() => chooseSort(option.key)}
          key={option.key}
        >
          {option.label}
          <SortIcon field={option.key} />
        </AriaButton>
      ))}
      {unlocked && <span className={styles.statusHeader}>Status</span>}
      {unlocked && <span />}
    </div>
  );

  return (
    <Panel
      title="Seniority"
      description="The shop seniority list drives the Work Pick and the Home Available Now roster."
      bodyClassName={styles.body}
      actions={
        unlocked ? (
          <>
            {saved && (
              <StatusBadge tone="success">
                <Check aria-hidden="true" /> Saved
              </StatusBadge>
            )}
            <Button variant="secondary" onPress={lock}>
              <Lock aria-hidden="true" /> Done
            </Button>
            <Button
              variant="primary"
              onPress={save}
              isDisabled={saving || !loaded}
            >
              <Save aria-hidden="true" /> {saving ? "Saving..." : "Save"}
            </Button>
          </>
        ) : (
          <AdminUnlockButton onSubmit={tryUnlock} label="Edit list" />
        )
      }
    >
      <div className={styles.toolbar}>
        <SearchField
          label="Search employees"
          labelHidden
          placeholder="Search name, employee ID, or classification"
          value={query}
          onChange={setQuery}
        />
        <span>{rows.length} employees</span>
      </div>

      {!loaded && <SkeletonRows rows={6} />}

      {loaded && (
        <DataTableFrame className={styles.table}>
          {sortHeader}
          {shown.length === 0 && (
            <EmptyState
              title="No matching employees"
              description="Try another name, employee ID, or classification."
            />
          )}

          {!unlocked &&
            shown.map(({ row, index }) => {
              const unavailable = !!row.availability?.trim();
              return (
                <article
                  className={styles.readRow}
                  data-unavailable={unavailable || undefined}
                  key={index}
                >
                  <span data-label="First">{row.firstName || "-"}</span>
                  <span data-label="Last">{row.lastName || "-"}</span>
                  <span data-label="Classification">
                    {row.classification || "-"}
                    {unavailable && (
                      <StatusBadge tone="warning">
                        {row.availability}
                      </StatusBadge>
                    )}
                  </span>
                  <span data-label="Shop seniority">
                    {fmtDate(row.startDate)}
                  </span>
                  <span data-label="Pace hire">{fmtDate(row.hireDate)}</span>
                  <span data-label="Employee ID">{row.badge || "-"}</span>
                </article>
              );
            })}

          {unlocked &&
            shown.map(({ row, index }) => (
              <article className={styles.editRow} key={index}>
                <TextField
                  label="First name"
                  value={row.firstName}
                  placeholder="First"
                  onChange={(value) => setRow(index, "firstName", value)}
                />
                <TextField
                  label="Last name"
                  value={row.lastName}
                  placeholder="Last"
                  onChange={(value) => setRow(index, "lastName", value)}
                />
                <TextField
                  label="Classification"
                  value={row.classification}
                  placeholder="Job title"
                  onChange={(value) =>
                    setRow(index, "classification", value)
                  }
                />
                <TextField
                  label="Shop seniority"
                  type="date"
                  value={row.startDate}
                  onChange={(value) => setRow(index, "startDate", value)}
                />
                <TextField
                  label="Pace hire date"
                  type="date"
                  value={row.hireDate}
                  onChange={(value) => setRow(index, "hireDate", value)}
                />
                <TextField
                  label="Employee ID"
                  value={row.badge}
                  placeholder="Employee ID"
                  inputMode="numeric"
                  onChange={(value) => setRow(index, "badge", value)}
                />
                <SelectField
                  label="Status"
                  selectedKey={row.availability || "available"}
                  onSelectionChange={(key) =>
                    setRow(
                      index,
                      "availability",
                      key === "available" ? "" : String(key),
                    )
                  }
                  options={[
                    { id: "available", label: "Available" },
                    ...UNAVAILABLE_REASONS.map((reason) => ({
                      id: reason,
                      label: reason,
                    })),
                    ...(row.availability &&
                    !UNAVAILABLE_REASONS.includes(row.availability)
                      ? [{ id: row.availability, label: row.availability }]
                      : []),
                  ]}
                />
                <IconButton
                  variant="quiet"
                  aria-label="Remove employee"
                  onPress={() => removeRow(index)}
                >
                  <Trash2 aria-hidden="true" />
                </IconButton>
              </article>
            ))}
        </DataTableFrame>
      )}

      {loaded && unlocked && (
        <div className={styles.footer}>
          <Button variant="secondary" onPress={addRow}>
            <Plus aria-hidden="true" /> Add employee
          </Button>
        </div>
      )}
    </Panel>
  );
}
