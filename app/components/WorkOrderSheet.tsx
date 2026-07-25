"use client";

import { useEffect, useRef, useState } from "react";
import { openSheetPdf } from "../lib/pdf";
import { Eraser, FileDown, Plus, Trash2, UserPlus, Save, FolderOpen, MoreHorizontal } from "lucide-react";
import WorkOrderHistory from "./WorkOrderHistory";
import DatePickerField from "./DatePickerField";
import { chicagoDateShort } from "../lib/chicagoTime";
import { ActionMenu, Button, Chip, ConfirmDialog, IconButton, Toolbar, ToolbarGroup } from "../ui";
import { PaperViewport } from "../sheets/core";
import { LETTER_PORTRAIT } from "../sheets/core/profiles";
import chromeStyles from "./SheetChrome.module.css";
import workOrderChromeStyles from "./WorkOrderChrome.module.css";

const STORAGE_KEY = "workorder";
const PRINT_PART_ROWS = 5;

// ---- data model ----
// One Work Order shared header, a list of employees (one printed sheet each), a
// list of operations each assigned to one or more employees (a shared operation
// prints on every assigned employee's sheet), and parts kept per employee.
interface WOEmployee {
  id: string;
  badge: string;
  name: string;
}
interface WOOperation {
  id: string;
  num: string;
  objectCode: string;
  description: string;
  date: string;
  hours: string;
  activity: string;
  assignedTo: string[]; // employee ids
}
interface WOPart {
  id: string;
  partNo: string;
  description: string;
  qty: string;
  serial: string;
  locator: string;
  operationNum: string;
  issuedBy: string;
}
interface WorkOrder {
  workOrderNumber: string;
  vehicleNumber: string;
  todaysDate: string;
  workOrderDescription: string;
  vehicleDescription: string;
  vehicleOdometer: string;
  workOrderCreationDate: string;
  createdBy: string;
  employees: WOEmployee[];
  operations: WOOperation[];
  parts: Record<string, WOPart[]>; // employeeId -> its parts
}

// Random ids for user-added rows (deterministic seed ids below keep SSR stable).
function uid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function blankPart(id: string): WOPart {
  return { id, partNo: "", description: "", qty: "", serial: "", locator: "", operationNum: "", issuedBy: "" };
}
function emptyWorkOrder(): WorkOrder {
  // Fixed seed ids so the first render matches on server + client (no hydration
  // mismatch); user-added rows use uid().
  return {
    workOrderNumber: "",
    vehicleNumber: "",
    todaysDate: "",
    workOrderDescription: "",
    vehicleDescription: "",
    vehicleOdometer: "",
    workOrderCreationDate: "",
    createdBy: "",
    employees: [{ id: "e1", badge: "", name: "" }],
    operations: [{ id: "o1", num: "", objectCode: "", description: "", date: "", hours: "", activity: "", assignedTo: ["e1"] }],
    parts: { e1: [blankPart("p1")] },
  };
}

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

const HEADER_ROWS: [keyof WorkOrder, string][] = [
  ["workOrderDescription", "Work Order Description:"],
  ["vehicleDescription", "Vehicle Description:"],
  ["vehicleOdometer", "Vehicle Odometer Reading:"],
  ["workOrderCreationDate", "Work Order Creation Date:"],
  ["createdBy", "Created By:"],
];

export default function WorkOrderSheet() {
  const [data, setData] = useState<WorkOrder>(emptyWorkOrder);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [pendingArchived, setPendingArchived] = useState<WorkOrder | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prewarmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setPrintMode(param("print") === "1");
  }, []);

  // Load the saved work order.
  useEffect(() => {
    let alive = true;
    fetch(`/api/state/${STORAGE_KEY}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d && d.value) setData({ ...emptyWorkOrder(), ...d.value });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Auto-fill Today's Date once, when empty.
  useEffect(() => {
    if (!loaded) return;
    setData((d) => {
      if (d.todaysDate) return d;
      return { ...d, todaysDate: chicagoDateShort() };
    });
  }, [loaded, data.todaysDate]);

  function schedulePrewarm() {
    if (printMode) return;
    clearTimeout(prewarmTimer.current);
    prewarmTimer.current = setTimeout(() => {
      fetch(`/api/pdf?path=/${STORAGE_KEY}&prewarm=1`).catch(() => {});
    }, 1500);
  }

  // Debounced autosave.
  useEffect(() => {
    if (!loaded || printMode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/state/${STORAGE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: data }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.updatedAt) setSavedAt(new Date(d.updatedAt));
          schedulePrewarm();
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loaded, printMode]);

  // ---- edits ----
  function setField(field: keyof WorkOrder, value: string) {
    setData((d) => ({ ...d, [field]: value }));
  }
  function setEmployee(id: string, patch: Partial<WOEmployee>) {
    setData((d) => ({ ...d, employees: d.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }
  function addEmployee() {
    setData((d) => {
      const id = uid("e");
      return { ...d, employees: [...d.employees, { id, badge: "", name: "" }], parts: { ...d.parts, [id]: [blankPart(uid("p"))] } };
    });
  }
  function removeEmployee(id: string) {
    setData((d) => {
      if (d.employees.length <= 1) return d;
      const employees = d.employees.filter((e) => e.id !== id);
      // Drop this employee from every operation; delete operations left with nobody.
      const operations = d.operations
        .map((o) => ({ ...o, assignedTo: o.assignedTo.filter((x) => x !== id) }))
        .filter((o) => o.assignedTo.length > 0);
      const parts = { ...d.parts };
      delete parts[id];
      return { ...d, employees, operations, parts };
    });
  }
  function setOperation(id: string, patch: Partial<WOOperation>) {
    setData((d) => ({ ...d, operations: d.operations.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }
  function addOperation(empId: string) {
    setData((d) => ({
      ...d,
      operations: [...d.operations, { id: uid("o"), num: "", objectCode: "", description: "", date: "", hours: "", activity: "", assignedTo: [empId] }],
    }));
  }
  // Remove an operation from THIS employee's sheet (delete it entirely if no one
  // else has it).
  function removeOperationFrom(opId: string, empId: string) {
    setData((d) => {
      const operations = d.operations
        .map((o) => (o.id === opId ? { ...o, assignedTo: o.assignedTo.filter((x) => x !== empId) } : o))
        .filter((o) => o.assignedTo.length > 0);
      return { ...d, operations };
    });
  }
  function toggleAssignee(opId: string, empId: string) {
    setData((d) => ({
      ...d,
      operations: d.operations.map((o) =>
        o.id === opId
          ? { ...o, assignedTo: o.assignedTo.includes(empId) ? o.assignedTo.filter((x) => x !== empId) : [...o.assignedTo, empId] }
          : o
      ),
    }));
  }
  function setPart(empId: string, partId: string, patch: Partial<WOPart>) {
    setData((d) => ({
      ...d,
      parts: { ...d.parts, [empId]: (d.parts[empId] || []).map((p) => (p.id === partId ? { ...p, ...patch } : p)) },
    }));
  }
  function addPart(empId: string) {
    setData((d) => ({ ...d, parts: { ...d.parts, [empId]: [...(d.parts[empId] || []), blankPart(uid("p"))] } }));
  }
  function removePart(empId: string, partId: string) {
    setData((d) => ({ ...d, parts: { ...d.parts, [empId]: (d.parts[empId] || []).filter((p) => p.id !== partId) } }));
  }

  const hasContent = (d: WorkOrder) =>
    !!(
      d.workOrderNumber ||
      d.vehicleNumber ||
      d.workOrderDescription ||
      d.vehicleDescription ||
      d.createdBy ||
      d.operations.some((o) => o.num || o.description || o.objectCode) ||
      d.employees.some((e) => e.badge || e.name) ||
      Object.values(d.parts).some((rows) => rows.some((p) => p.partNo || p.description))
    );

  async function clearAll() {
    setData(emptyWorkOrder());
  }
  // Save a snapshot into the searchable archive (looked up later by number /
  // employee / operation).
  async function saveToArchive() {
    if (!hasContent(data)) return;
    await fetch(`/api/state/${STORAGE_KEY}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: data }),
    }).catch(() => {});
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }
  function loadArchived(sheet: unknown, _id: string) {
    setPendingArchived({ ...emptyWorkOrder(), ...(sheet as WorkOrder) });
    setHistOpen(false);
  }
  function printPdf() {
    openSheetPdf({
      path: `/${STORAGE_KEY}`,
      flush: () =>
        fetch(`/api/state/${STORAGE_KEY}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: data }),
        }),
    });
  }

  // ---- one employee's 1:1 sheet ----
  function EmployeeSheet({ emp, index }: { emp: WOEmployee; index: number }) {
    const ops = data.operations.filter((o) => o.assignedTo.includes(emp.id));
    const parts = data.parts[emp.id] || [];
    const partRows = printMode
      ? Array.from({ length: Math.max(PRINT_PART_ROWS, parts.length) }, (_, i) => parts[i] || blankPart(`print-${i}`))
      : parts;
    const others = data.employees.filter((e) => e.id !== emp.id);
    return (
      <div
        className="wo-sheet"
        data-paper-page=""
        data-paper-profile="letter-portrait"
        data-sheet-id="workorder"
        data-page-number={index + 1}
      >
        {/* screen-only sheet toolbar */}
        {!printMode && data.employees.length > 1 && (
          <div className={`${workOrderChromeStyles.sheetBar} no-print`}>
            <span className={workOrderChromeStyles.sheetLabel}>Sheet {index + 1}{emp.name ? ` · ${emp.name}` : ""}</span>
            <IconButton
              className={workOrderChromeStyles.paperIconButton}
              variant="quiet"
              size="sm"
              onPress={() => removeEmployee(emp.id)}
              aria-label="Remove this employee's sheet"
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        )}

        <div className="wo-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wo-logo" src="/pace-logo.png" alt="pace" />
          <div className="wo-brand-rule" />
          <h1 className="wo-title">Oracle eAM Work Order</h1>
        </div>

        <table className="wo-head">
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "40%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="wo-lbl">Work Order Number:</td>
              <td className="wo-lbl">Vehicle Number:</td>
              <td className="wo-lbl">Today&apos;s Date:</td>
            </tr>
            <tr>
              <td><input className="wo-in" value={data.workOrderNumber} onChange={(e) => setField("workOrderNumber", e.target.value)} /></td>
              <td><input className="wo-in" value={data.vehicleNumber} onChange={(e) => setField("vehicleNumber", e.target.value)} /></td>
              <td><DatePickerField className="wo-in" value={data.todaysDate} onValueChange={(value) => setField("todaysDate", value)} shortYear ariaLabel="Today's date" /></td>
            </tr>
            {HEADER_ROWS.map(([field, label]) => (
              <tr key={field}>
                <td className="wo-lbl">{label}</td>
                <td colSpan={2}>
                  {field === "workOrderCreationDate" ? (
                    <DatePickerField className="wo-in" value={String(data[field] || "")} onValueChange={(value) => setField(field, value)} ariaLabel="Work order creation date" />
                  ) : (
                    <input className="wo-in" value={String(data[field] || "")} onChange={(e) => setField(field, e.target.value)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="wo-ops">
          <colgroup>
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Operation#</th>
              <th>Object Code</th>
              <th>Description</th>
              <th>Date</th>
              <th>Hours</th>
              <th>Activity</th>
              {!printMode && <th className="wo-opact no-print" aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => (
              <tr className="wo-oprow" key={o.id}>
                <td><input className="wo-in" value={o.num} onChange={(e) => setOperation(o.id, { num: e.target.value })} /></td>
                <td><input className="wo-in" value={o.objectCode} onChange={(e) => setOperation(o.id, { objectCode: e.target.value })} /></td>
                <td><input className="wo-in" value={o.description} onChange={(e) => setOperation(o.id, { description: e.target.value })} /></td>
                <td><DatePickerField className="wo-in wo-in--c" value={o.date} onValueChange={(value) => setOperation(o.id, { date: value })} ariaLabel={`Operation ${o.num || "date"}`} /></td>
                <td><input className="wo-in wo-in--c" value={o.hours} onChange={(e) => setOperation(o.id, { hours: e.target.value })} placeholder="____.__" /></td>
                <td><input className="wo-in wo-in--c" value={o.activity} onChange={(e) => setOperation(o.id, { activity: e.target.value })} placeholder="__________" /></td>
                {!printMode && (
                  <td className="wo-opact no-print">
                    <IconButton
                      className={workOrderChromeStyles.paperIconButton}
                      variant="quiet"
                      size="sm"
                      onPress={() => removeOperationFrom(o.id, emp.id)}
                      aria-label="Remove operation from this sheet"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </td>
                )}
              </tr>
            ))}
            {/* Assign operations to other employees (screen only). */}
            {!printMode && ops.length > 0 && others.length > 0 && (
              <tr className="no-print">
                <td colSpan={7} className={workOrderChromeStyles.shareCell}>
                  <span className={workOrderChromeStyles.shareLabel}>Also on:</span>
                  {ops.map((o) => (
                    <span className={workOrderChromeStyles.shareOperation} key={o.id}>
                      <span className={workOrderChromeStyles.shareOperationNumber}>{o.num || "Op"}</span>
                      {others.map((e) => (
                        <Chip
                          key={e.id}
                          className={workOrderChromeStyles.paperChip}
                          isSelected={o.assignedTo.includes(e.id)}
                          onPress={() => toggleAssignee(o.id, e.id)}
                        >
                          {e.name || e.badge || `Sheet ${data.employees.findIndex((x) => x.id === e.id) + 1}`}
                        </Chip>
                      ))}
                    </span>
                  ))}
                </td>
              </tr>
            )}
            {!printMode && (
              <tr className="no-print">
                <td colSpan={7}>
                  <Button className={workOrderChromeStyles.addRow} variant="quiet" size="sm" onPress={() => addOperation(emp.id)}>
                    <Plus size={14} /> Add operation
                  </Button>
                </td>
              </tr>
            )}
            <tr className="wo-badge">
              <td className="wo-lbl wo-badge__lbl" colSpan={3}>
                <span>Badge Number</span>
                <input className="wo-in" value={emp.badge} onChange={(e) => setEmployee(emp.id, { badge: e.target.value })} />
              </td>
              <td className="wo-lbl wo-badge__lbl" colSpan={printMode ? 3 : 4}>
                <span>Employee Name</span>
                <input className="wo-in" value={emp.name} onChange={(e) => setEmployee(emp.id, { name: e.target.value })} />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="wo-completion">Completion information:</div>

        <table className="wo-parts">
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Part No.</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Serial Number</th>
              <th>Locator</th>
              <th>Operation Number</th>
              <th>Issued By</th>
              {!printMode && <th className="wo-opact no-print" aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {partRows.map((p, i) => (
              <tr key={p.id}>
                <td><input className="wo-in" value={p.partNo} onChange={(e) => setPart(emp.id, p.id, { partNo: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                <td><input className="wo-in" value={p.description} onChange={(e) => setPart(emp.id, p.id, { description: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                <td><input className="wo-in wo-in--c" value={p.qty} onChange={(e) => setPart(emp.id, p.id, { qty: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                <td><input className="wo-in" value={p.serial} onChange={(e) => setPart(emp.id, p.id, { serial: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                <td><input className="wo-in" value={p.locator} onChange={(e) => setPart(emp.id, p.id, { locator: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                <td><input className="wo-in wo-in--c" value={p.operationNum} onChange={(e) => setPart(emp.id, p.id, { operationNum: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                <td><input className="wo-in" value={p.issuedBy} onChange={(e) => setPart(emp.id, p.id, { issuedBy: e.target.value })} readOnly={printMode && i >= parts.length} /></td>
                {!printMode && i < parts.length && (
                  <td className="wo-opact no-print">
                    <IconButton
                      className={workOrderChromeStyles.paperIconButton}
                      variant="quiet"
                      size="sm"
                      onPress={() => removePart(emp.id, p.id)}
                      aria-label="Remove part"
                      isDisabled={parts.length <= 1}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </td>
                )}
              </tr>
            ))}
            {!printMode && (
              <tr className="no-print">
                <td colSpan={8}>
                  <Button className={workOrderChromeStyles.addRow} variant="quiet" size="sm" onPress={() => addPart(emp.id)}>
                    <Plus size={14} /> Add part
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="wo-pagefoot">Page {index + 1} of {data.employees.length}</div>
      </div>
    );
  }

  return (
    <div className={chromeStyles.page}>
      <style dangerouslySetInnerHTML={{ __html: "@page { size: letter portrait; margin: 0.5in 0.55in 0.42in; }" }} />

      <Toolbar className={`${chromeStyles.toolbar} no-print`}>
        <div className={chromeStyles.title}>Work Order</div>
        <ToolbarGroup className={chromeStyles.actions}>
          <span className={chromeStyles.saved}>
            {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
          </span>
          <Button onPress={() => setHistOpen(true)}>
            <FolderOpen aria-hidden="true" /> Saved
          </Button>
          <Button onPress={saveToArchive}>
            <Save aria-hidden="true" /> {savedFlash ? "Saved ✓" : "Save"}
          </Button>
          <ActionMenu
            label={<><MoreHorizontal size={16} /> More</>}
            items={[
              {
                id: "clear",
                label: "Clear work order",
                icon: <Eraser size={16} />,
                tone: "danger",
              },
            ]}
            onAction={(key) => {
              if (key === "clear") setClearOpen(true);
            }}
          />
          <Button variant="primary" onPress={printPdf}>
            <FileDown aria-hidden="true" /> Print PDF
          </Button>
        </ToolbarGroup>
      </Toolbar>

      <PaperViewport profile={LETTER_PORTRAIT} fitOnMobile label="Work Order paper preview">
        {data.employees.map((emp, i) => (
          <EmployeeSheet key={emp.id} emp={emp} index={i} />
        ))}

        {!printMode && (
          <div className={`${workOrderChromeStyles.addEmployee} no-print`}>
            <Button onPress={addEmployee}>
              <UserPlus aria-hidden="true" /> Add employee (new sheet)
            </Button>
          </div>
        )}
      </PaperViewport>

      {histOpen && <WorkOrderHistory onLoad={loadArchived} onClose={() => setHistOpen(false)} />}

      <ConfirmDialog
        isOpen={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this Work Order?"
        description="Save it first if you want to keep it in the lookup."
        confirmLabel="Clear work order"
        tone="danger"
        onConfirm={clearAll}
      />

      <ConfirmDialog
        isOpen={pendingArchived !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchived(null);
        }}
        title="Open this saved work order?"
        description="It replaces the work order you are editing. Save the current one first if you want to keep it."
        confirmLabel="Open saved work order"
        onConfirm={() => {
          if (pendingArchived) setData(pendingArchived);
        }}
      />

      {loaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
