"use client";

import { useEffect, useRef, useState } from "react";
import { openSheetPdf } from "../lib/pdf";
import { Eraser, FileDown, Plus, Trash2, UserPlus } from "lucide-react";
import ToolMenu from "./ToolMenu";

const STORAGE_KEY = "workorder";

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
    if (!loaded || printMode) return;
    setData((d) => {
      if (d.todaysDate) return d;
      const now = new Date();
      const t = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${String(now.getFullYear()).slice(-2)}`;
      return { ...d, todaysDate: t };
    });
  }, [loaded, printMode]);

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
    if (!window.confirm("Clear this Work Order? This can't be undone.")) return;
    setData(emptyWorkOrder());
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
    const others = data.employees.filter((e) => e.id !== emp.id);
    return (
      <div className="wo-sheet">
        {/* screen-only sheet toolbar */}
        {!printMode && data.employees.length > 1 && (
          <div className="wo-sheet__bar no-print">
            <span className="wo-sheet__label">Sheet {index + 1}{emp.name ? ` · ${emp.name}` : ""}</span>
            <button className="wo-iconbtn wo-iconbtn--danger" onClick={() => removeEmployee(emp.id)} title="Remove this employee's sheet">
              <Trash2 size={15} />
            </button>
          </div>
        )}

        <div className="wo-head-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wo-logo" src="/logo.png" alt="pace" />
          <h1 className="wo-title">Oracle eAM Work Order</h1>
        </div>

        <table className="wo-head">
          <tbody>
            <tr>
              <td className="wo-lbl">Work Order Number:</td>
              <td className="wo-lbl">Vehicle Number:</td>
              <td className="wo-lbl">Today&apos;s Date:</td>
            </tr>
            <tr>
              <td><input className="wo-in" value={data.workOrderNumber} onChange={(e) => setField("workOrderNumber", e.target.value)} /></td>
              <td><input className="wo-in" value={data.vehicleNumber} onChange={(e) => setField("vehicleNumber", e.target.value)} /></td>
              <td><input className="wo-in" value={data.todaysDate} onChange={(e) => setField("todaysDate", e.target.value)} /></td>
            </tr>
            {HEADER_ROWS.map(([field, label]) => (
              <tr key={field}>
                <td className="wo-lbl">{label}</td>
                <td colSpan={2}>
                  <input className="wo-in" value={String(data[field] || "")} onChange={(e) => setField(field, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="wo-ops">
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
              <tr key={o.id}>
                <td><input className="wo-in" value={o.num} onChange={(e) => setOperation(o.id, { num: e.target.value })} /></td>
                <td><input className="wo-in" value={o.objectCode} onChange={(e) => setOperation(o.id, { objectCode: e.target.value })} /></td>
                <td><input className="wo-in" value={o.description} onChange={(e) => setOperation(o.id, { description: e.target.value })} /></td>
                <td><input className="wo-in wo-in--c" value={o.date} onChange={(e) => setOperation(o.id, { date: e.target.value })} placeholder="__/__/__" /></td>
                <td><input className="wo-in wo-in--c" value={o.hours} onChange={(e) => setOperation(o.id, { hours: e.target.value })} /></td>
                <td><input className="wo-in" value={o.activity} onChange={(e) => setOperation(o.id, { activity: e.target.value })} /></td>
                {!printMode && (
                  <td className="wo-opact no-print">
                    <button className="wo-iconbtn wo-iconbtn--danger" onClick={() => removeOperationFrom(o.id, emp.id)} title="Remove operation from this sheet">
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {/* Assign operations to other employees (screen only). */}
            {!printMode && ops.length > 0 && others.length > 0 && (
              <tr className="no-print">
                <td colSpan={7} className="wo-share">
                  <span className="wo-share__lbl">Also on:</span>
                  {ops.map((o) => (
                    <span className="wo-share__op" key={o.id}>
                      <span className="wo-share__opnum">{o.num || "Op"}</span>
                      {others.map((e) => (
                        <button
                          key={e.id}
                          className={`wo-share__chip ${o.assignedTo.includes(e.id) ? "wo-share__chip--on" : ""}`}
                          onClick={() => toggleAssignee(o.id, e.id)}
                        >
                          {e.name || e.badge || `Sheet ${data.employees.findIndex((x) => x.id === e.id) + 1}`}
                        </button>
                      ))}
                    </span>
                  ))}
                </td>
              </tr>
            )}
            {!printMode && (
              <tr className="no-print">
                <td colSpan={7}>
                  <button className="wo-addrow" onClick={() => addOperation(emp.id)}>
                    <Plus size={14} /> Add operation
                  </button>
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
            {parts.map((p) => (
              <tr key={p.id}>
                <td><input className="wo-in" value={p.partNo} onChange={(e) => setPart(emp.id, p.id, { partNo: e.target.value })} /></td>
                <td><input className="wo-in" value={p.description} onChange={(e) => setPart(emp.id, p.id, { description: e.target.value })} /></td>
                <td><input className="wo-in wo-in--c" value={p.qty} onChange={(e) => setPart(emp.id, p.id, { qty: e.target.value })} /></td>
                <td><input className="wo-in" value={p.serial} onChange={(e) => setPart(emp.id, p.id, { serial: e.target.value })} /></td>
                <td><input className="wo-in" value={p.locator} onChange={(e) => setPart(emp.id, p.id, { locator: e.target.value })} /></td>
                <td><input className="wo-in wo-in--c" value={p.operationNum} onChange={(e) => setPart(emp.id, p.id, { operationNum: e.target.value })} /></td>
                <td><input className="wo-in" value={p.issuedBy} onChange={(e) => setPart(emp.id, p.id, { issuedBy: e.target.value })} /></td>
                {!printMode && (
                  <td className="wo-opact no-print">
                    <button className="wo-iconbtn wo-iconbtn--danger" onClick={() => removePart(emp.id, p.id)} title="Remove part" disabled={parts.length <= 1}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!printMode && (
              <tr className="no-print">
                <td colSpan={8}>
                  <button className="wo-addrow" onClick={() => addPart(emp.id)}>
                    <Plus size={14} /> Add part
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="app">
      <style dangerouslySetInnerHTML={{ __html: "@page { size: letter portrait; margin: 0.45in; }" }} />

      <div className="toolbar no-print">
        <div className="toolbar__title">Work Order</div>
        <div className="toolbar__spacer" />
        <span className="toolbar__saved">
          {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : loaded ? "—" : "Loading…"}
        </span>
        <ToolMenu>
          <button className="toolmenu__item toolmenu__item--danger" onClick={clearAll}>
            <Eraser size={16} /> Clear work order
          </button>
        </ToolMenu>
        <button className="btn btn--primary" onClick={printPdf}>
          <FileDown size={16} /> Print PDF
        </button>
      </div>

      <div className="sheet-scroll">
        {data.employees.map((emp, i) => (
          <EmployeeSheet key={emp.id} emp={emp} index={i} />
        ))}

        {!printMode && (
          <div className="wo-addemp no-print">
            <button className="btn" onClick={addEmployee}>
              <UserPlus size={16} /> Add employee (new sheet)
            </button>
          </div>
        )}
      </div>

      {loaded && <div id="print-ready" aria-hidden="true" style={{ display: "none" }} />}
    </div>
  );
}
