import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import {
  PAYROLL_LEAVE_TYPES,
  REQUEST_LEAVE_TYPES,
  type RequestDateParts,
  type RequestTimeOffData,
} from "./schema";
import styles from "./RequestTimeOffPaper.module.css";

interface RequestTimeOffPaperProps {
  data: RequestTimeOffData;
  onChange?: (next: RequestTimeOffData) => void;
}

type TextField =
  | "submittedAt"
  | "totalDays"
  | "employeeSignature"
  | "badgeNumber"
  | "employeeDate"
  | "coordinatorSignature"
  | "coordinatorDate"
  | "superintendentSignature"
  | "superintendentDate";

function cleanDatePart(part: keyof RequestDateParts, value: string): string {
  return value.replace(/\D/g, "").slice(0, part === "year" ? 4 : 2);
}

export function RequestTimeOffPaper({
  data,
  onChange,
}: RequestTimeOffPaperProps) {
  function setText(field: TextField, value: string) {
    onChange?.({ ...data, [field]: value });
  }

  function setDatePart(
    field: "startDate" | "endDate",
    part: keyof RequestDateParts,
    value: string,
  ) {
    onChange?.({
      ...data,
      [field]: { ...data[field], [part]: cleanDatePart(part, value) },
    });
  }

  function toggleChoice(
    field: "leaveTypes" | "payrollTypes",
    id: string,
    checked: boolean,
  ) {
    onChange?.({
      ...data,
      [field]: { ...data[field], [id]: checked },
    });
  }

  function setApproval(field: "approved" | "notApproved", checked: boolean) {
    onChange?.({ ...data, [field]: checked });
  }

  function dateFields(
    field: "startDate" | "endDate",
    label: string,
  ) {
    const value = data[field];
    return (
      <span className={styles.dateFields} aria-label={label}>
        {(["month", "day", "year"] as const).map((part, index) => (
          <span className={styles.datePart} key={part}>
            <input
              aria-label={`${label} ${part}`}
              value={value[part]}
              onChange={(event) => setDatePart(field, part, event.target.value)}
              readOnly={!onChange}
              inputMode="numeric"
              maxLength={part === "year" ? 4 : 2}
            />
            {index < 2 && <span>/</span>}
          </span>
        ))}
      </span>
    );
  }

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="request-time-off"
      pageNumber={1}
      className={styles.page}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <h1>REQUEST TIME OFF</h1>

      <label className={styles.timestamp}>
        <span>Date/ Time stamp</span>
        <input
          aria-label="Date and time stamp"
          value={data.submittedAt}
          onChange={(event) => setText("submittedAt", event.target.value)}
          readOnly={!onChange}
        />
      </label>

      <section className={styles.leaveSection}>
        <h2>Type of leave:</h2>
        <div className={styles.leaveGrid}>
          {REQUEST_LEAVE_TYPES.map((choice) => (
            <label className={styles.choice} key={choice.id}>
              <input
                type="checkbox"
                checked={!!data.leaveTypes[choice.id]}
                onChange={(event) =>
                  toggleChoice("leaveTypes", choice.id, event.target.checked)
                }
                readOnly={!onChange}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.period}>
        <p>I request the above leave for the period time beginning:</p>
        <div className={styles.periodFields}>
          <span>On</span>
          {dateFields("startDate", "Leave start date")}
          <span>to</span>
          {dateFields("endDate", "Leave end date")}
          <span>a total of</span>
          <input
            className={styles.days}
            aria-label="Total leave days"
            value={data.totalDays}
            onChange={(event) =>
              setText("totalDays", event.target.value.replace(/[^0-9.]/g, "").slice(0, 6))
            }
            readOnly={!onChange}
            inputMode="decimal"
          />
          <span>days.</span>
        </div>
      </section>

      <section className={styles.employeeBlock}>
        <label className={`${styles.lineField} ${styles.employeeSignature}`}>
          <span>Employee Signature</span>
          <span className={styles.prefixedLine}>
            <b>X</b>
            <input
              aria-label="Employee signature"
              value={data.employeeSignature}
              onChange={(event) =>
                setText("employeeSignature", event.target.value)
              }
              readOnly={!onChange}
            />
          </span>
        </label>
        <label className={styles.lineField}>
          <span>Badge Number</span>
          <span className={styles.prefixedLine}>
            <b>#</b>
            <input
              aria-label="Badge number"
              value={data.badgeNumber}
              onChange={(event) =>
                setText("badgeNumber", event.target.value.replace(/\D/g, "").slice(0, 12))
              }
              readOnly={!onChange}
              inputMode="numeric"
            />
          </span>
        </label>
        <label className={styles.lineField}>
          <span>Date:</span>
          <input
            aria-label="Employee request date"
            value={data.employeeDate}
            onChange={(event) => setText("employeeDate", event.target.value)}
            readOnly={!onChange}
          />
        </label>
      </section>

      <div className={styles.payrollChoices}>
        {PAYROLL_LEAVE_TYPES.map((choice) => (
          <label className={styles.choice} key={choice.id}>
            <input
              type="checkbox"
              checked={!!data.payrollTypes[choice.id]}
              onChange={(event) =>
                toggleChoice("payrollTypes", choice.id, event.target.checked)
              }
              readOnly={!onChange}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>

      <section className={styles.approvalLines}>
        <label className={styles.approvalLine}>
          <input
            aria-label="Maintenance Data Coordinator signature"
            value={data.coordinatorSignature}
            onChange={(event) =>
              setText("coordinatorSignature", event.target.value)
            }
            readOnly={!onChange}
          />
          <span>Maintenance Data Coordinator</span>
        </label>
        <label className={`${styles.approvalLine} ${styles.approvalDate}`}>
          <input
            aria-label="Maintenance Data Coordinator date"
            value={data.coordinatorDate}
            onChange={(event) => setText("coordinatorDate", event.target.value)}
            readOnly={!onChange}
          />
          <span>Date</span>
        </label>

        <label className={styles.approvalLine}>
          <input
            aria-label="Superintendent of Maintenance signature"
            value={data.superintendentSignature}
            onChange={(event) =>
              setText("superintendentSignature", event.target.value)
            }
            readOnly={!onChange}
          />
          <span>Superintendent of Maintenance</span>
        </label>
        <label className={`${styles.approvalLine} ${styles.approvalDate}`}>
          <input
            aria-label="Superintendent of Maintenance date"
            value={data.superintendentDate}
            onChange={(event) =>
              setText("superintendentDate", event.target.value)
            }
            readOnly={!onChange}
          />
          <span>Date</span>
        </label>
      </section>

      <div className={styles.finalDecision}>
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={data.approved}
            onChange={(event) => setApproval("approved", event.target.checked)}
            readOnly={!onChange}
          />
          <span>Approved</span>
        </label>
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={data.notApproved}
            onChange={(event) =>
              setApproval("notApproved", event.target.checked)
            }
            readOnly={!onChange}
          />
          <span>Not Approved</span>
        </label>
      </div>

      <SheetRevision sheetId="request-time-off" />
    </PaperPage>
  );
}
