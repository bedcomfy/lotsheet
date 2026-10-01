import { dateValueToIso, isoToDisplayDate } from "../../lib/dateField";
import type { WorkOrder, WOEmployee } from "./types";
import styles from "./WorkOrderPaper.module.css";

const date = (value: string) => isoToDisplayDate(dateValueToIso(value)) || value;

function Identity({ data, employee }: { data: WorkOrder; employee: WOEmployee }) {
  return <div className={styles.identity}>
    <span>Work Order: {data.workOrderNumber || "________"}</span>
    <span>Vehicle: {data.vehicleNumber || "________"}</span>
    <span>Employee: {employee.name || employee.badge || "________"}</span>
  </div>;
}

/** Read-only print layout. Plain text can wrap and paginate; form inputs cannot.
 * Each employee starts on a fresh page, with natural continuation pages when
 * necessary. Table headers repeat the work order and employee identity. */
export function WorkOrderPaper({ data, blank = false, preview = false }: {
  data: WorkOrder;
  blank?: boolean;
  preview?: boolean;
}) {
  return <div className={styles.document} data-workorder-paper="" data-preview={preview}>
    {data.employees.map((employee) => {
      const operations = data.operations.filter((operation) => operation.assignedTo.includes(employee.id));
      const parts = data.parts[employee.id] || [];
      const partRows = Array.from({ length: Math.max(blank ? 1 : 5, parts.length) }, (_, i) => parts[i]);
      return <article className={styles.employee} data-employee={employee.id} key={employee.id}>
        <header className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pace-logo.png" alt="Pace" />
          <div className={styles.brandRule} />
          <h1>Oracle eAM Work Order</h1>
        </header>
        <table className={`${styles.table} ${styles.header}`} aria-label="Work order details">
          <colgroup><col style={{ width: "32%" }} /><col style={{ width: "28%" }} /><col style={{ width: "40%" }} /></colgroup>
          <tbody>
            <tr><th>Work Order Number:</th><th>Vehicle Number:</th><th>Today’s Date:</th></tr>
            <tr><td>{data.workOrderNumber}</td><td>{data.vehicleNumber}</td><td>{date(data.todaysDate)}</td></tr>
            <tr><th>Work Order Description:</th><td colSpan={2}>{data.workOrderDescription}</td></tr>
            <tr><th>Vehicle Description:</th><td colSpan={2}>{data.vehicleDescription}</td></tr>
            <tr><th>Vehicle Odometer Reading:</th><td colSpan={2}>{data.vehicleOdometer}</td></tr>
            <tr><th>Work Order Creation Date:</th><td colSpan={2}>{date(data.workOrderCreationDate)}</td></tr>
            <tr><th>Created By:</th><td colSpan={2}>{data.createdBy}</td></tr>
          </tbody>
        </table>
        <table className={`${styles.table} ${styles.operations}`} aria-label="Operations">
          <colgroup>{[12, 13, 34, 15, 12, 14].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
          <thead>
            <tr><td className={styles.identityCell} colSpan={6}><Identity data={data} employee={employee} /></td></tr>
            <tr><th>Operation #</th><th>Object Code</th><th>Description</th><th>Date</th><th>Hours</th><th>Activity</th></tr>
          </thead>
          <tbody>
            {operations.map((operation) => <tr key={operation.id} data-operation={operation.id}>
              <td>{operation.num}</td><td>{operation.objectCode}</td><td>{operation.description}</td>
              <td>{date(operation.date)}</td>
              <td className={styles.lineCell}><div>{operation.hours}</div></td>
              <td className={styles.lineCell}><div>{operation.activity}</div></td>
            </tr>)}
          </tbody>
        </table>
        <div className={styles.badge}>
          <div><strong>Badge Number</strong> {employee.badge}</div>
          <div><strong>Employee Name</strong> {employee.name}</div>
        </div>
        <table className={`${styles.table} ${styles.parts}`} aria-label="Completion information and parts">
          <colgroup>{[11, 27, 8, 14, 12, 14, 14].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
          <thead>
            <tr><td className={styles.completion} colSpan={7}>Completion information:</td></tr>
            <tr><td className={styles.identityCell} colSpan={7}><Identity data={data} employee={employee} /></td></tr>
            <tr><th>Part No.</th><th>Description</th><th>Qty</th><th>Serial Number</th><th>Locator</th><th>Operation Number</th><th>Issued By</th></tr>
          </thead>
          <tbody>
            {partRows.map((part, i) => <tr key={part?.id || `blank-${i}`} data-part={part?.id || `blank-${i}`}>
              <td>{part?.partNo}</td><td>{part?.description}</td><td>{part?.qty}</td><td>{part?.serial}</td>
              <td>{part?.locator}</td><td>{part?.operationNum}</td><td>{part?.issuedBy}</td>
            </tr>)}
          </tbody>
        </table>
      </article>;
    })}
  </div>;
}
