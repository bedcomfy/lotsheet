import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import {
  DRIVER_AREA_TASKS,
  INTERIOR_CLEANING_TASKS,
  type InteriorCleaningData,
} from "./schema";
import styles from "./InteriorCleaningPaper.module.css";

interface InteriorCleaningPaperProps {
  data: InteriorCleaningData;
  onChange?: (next: InteriorCleaningData) => void;
  dateOverride?: string;
}

export function InteriorCleaningPaper({
  data,
  onChange,
  dateOverride = "",
}: InteriorCleaningPaperProps) {
  const dateParts = (dateOverride || data.date)
    .split("/")
    .concat(["", "", ""])
    .slice(0, 3);

  function setField(
    field: "busNumber" | "date" | "workOrderNumber" | "foremanInitials",
    value: string,
  ) {
    onChange?.({ ...data, [field]: value });
  }

  function setInitial(id: string, value: string) {
    onChange?.({
      ...data,
      initials: { ...data.initials, [id]: value.toUpperCase() },
    });
  }

  function setDefect(index: number, value: string) {
    const defects = [...data.defects];
    while (defects.length < 2) defects.push("");
    defects[index] = value;
    onChange?.({ ...data, defects });
  }

  function setDatePart(index: number, value: string) {
    const parts = [...dateParts];
    parts[index] = value.replace(/\D/g, "").slice(0, index === 2 ? 4 : 2);
    setField("date", parts.every((part) => !part) ? "" : parts.join("/"));
  }

  function taskRows(
    tasks: ReadonlyArray<{ id: string; label: string }>,
  ) {
    return tasks.map((task) => (
      <div className={styles.task} key={task.id}>
        <span className={styles.taskLabel}>{task.label}</span>
        <label className={styles.initials}>
          <span>Initials:</span>
          <input
            aria-label={`${task.label} initials`}
            value={data.initials[task.id] || ""}
            onChange={(event) => setInitial(task.id, event.target.value)}
            readOnly={!onChange}
            maxLength={6}
          />
        </label>
      </div>
    ));
  }

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="interior-cleaning"
      pageNumber={1}
      className={styles.page}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <header className={styles.header}>
        <div>Pace Northwest Division</div>
        <h1>Interior Bus Cleaning</h1>
      </header>

      <div className={styles.details}>
        <label>
          <span>Bus #</span>
          <input
            value={data.busNumber}
            onChange={(event) => setField("busNumber", event.target.value)}
            readOnly={!onChange}
            inputMode="numeric"
          />
        </label>
        <label className={styles.date}>
          <span>Date:</span>
          <span className={styles.dateFields}>
            {dateParts.map((part, index) => (
              <span className={styles.datePart} key={index}>
                <input
                  aria-label={["Month", "Day", "Year"][index]}
                  value={part}
                  onChange={(event) => setDatePart(index, event.target.value)}
                  readOnly={!onChange || !!dateOverride}
                  inputMode="numeric"
                />
                {index < 2 && <span>/</span>}
              </span>
            ))}
          </span>
        </label>
        <label className={styles.workOrder}>
          <span>Work Order #</span>
          <input
            value={data.workOrderNumber}
            onChange={(event) =>
              setField("workOrderNumber", event.target.value)
            }
            readOnly={!onChange}
            inputMode="numeric"
          />
        </label>
      </div>

      <section className={styles.section}>
        <h2>Bus Interior</h2>
        <div className={styles.tasks}>{taskRows(INTERIOR_CLEANING_TASKS)}</div>
      </section>

      <section className={styles.section}>
        <h2>Drivers Area</h2>
        <div className={styles.tasks}>{taskRows(DRIVER_AREA_TASKS)}</div>
      </section>

      <div className={styles.foreman}>
        <label>
          <span>Foreman / S.R. Initials:</span>
          <input
            value={data.foremanInitials}
            onChange={(event) =>
              setField("foremanInitials", event.target.value.toUpperCase())
            }
            readOnly={!onChange}
            maxLength={8}
          />
        </label>
      </div>

      <section className={styles.defects}>
        <h2>List any defects:</h2>
        {[0, 1].map((index) => (
          <input
            key={index}
            aria-label={`Defect ${index + 1}`}
            value={data.defects[index] || ""}
            onChange={(event) => setDefect(index, event.target.value)}
            readOnly={!onChange}
          />
        ))}
      </section>

      <SheetRevision sheetId="interior-cleaning" />
    </PaperPage>
  );
}
