import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import type { MeterReadingsData } from "./schema";
import styles from "./MeterReadingsPaper.module.css";

interface MeterReadingsPaperProps {
  data: MeterReadingsData;
  onChange?: (next: MeterReadingsData) => void;
  dateOverride?: string;
}

type StringField = Exclude<
  keyof MeterReadingsData,
  "version" | "busesWashed" | "busesNotWashed"
>;

function splitParts(value: string, separator: string, count: number): string[] {
  const parts = value.split(separator);
  return Array.from({ length: count }, (_, index) => parts[index] || "");
}

export function MeterReadingsPaper({
  data,
  onChange,
  dateOverride = "",
}: MeterReadingsPaperProps) {
  function setField(field: StringField, value: string) {
    onChange?.({ ...data, [field]: value });
  }

  function toggle(field: "busesWashed" | "busesNotWashed") {
    onChange?.({
      ...data,
      [field]: !data[field],
      ...(field === "busesWashed" && !data.busesWashed
        ? { busesNotWashed: false }
        : {}),
      ...(field === "busesNotWashed" && !data.busesNotWashed
        ? { busesWashed: false }
        : {}),
    });
  }

  function check(
    field: "busesWashed" | "busesNotWashed",
    label: string,
  ) {
    return (
      <button
        type="button"
        className={styles.check}
        aria-pressed={data[field]}
        onClick={() => toggle(field)}
        disabled={!onChange}
      >
        <span aria-hidden="true">{data[field] ? "X" : ""}</span>
        {label}
      </button>
    );
  }

  const dateParts = splitParts(dateOverride || data.date, "/", 3);

  function setDatePart(index: number, value: string) {
    const parts = [...dateParts];
    parts[index] = value.replace(/\D/g, "").slice(0, index === 2 ? 4 : 2);
    setField("date", parts.every((part) => !part) ? "" : parts.join("/"));
  }

  function timeInputs(field: "washStart" | "washEnd", label: string) {
    const parts = splitParts(data[field], ":", 2);
    const setPart = (index: number, value: string) => {
      const next = [...parts];
      next[index] = value.replace(/\D/g, "").slice(0, 2);
      setField(field, next.every((part) => !part) ? "" : next.join(":"));
    };
    return (
      <span className={styles.time} aria-label={label}>
        <input
          aria-label={`${label} hour`}
          value={parts[0]}
          onChange={(event) => setPart(0, event.target.value)}
          readOnly={!onChange}
          inputMode="numeric"
        />
        <span>:</span>
        <input
          aria-label={`${label} minute`}
          value={parts[1]}
          onChange={(event) => setPart(1, event.target.value)}
          readOnly={!onChange}
          inputMode="numeric"
        />
      </span>
    );
  }

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="meter-readings"
      pageNumber={1}
      className={styles.page}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <header className={styles.header}>
        <h1>Daily Consumption Readings</h1>
        <div className={styles.date} aria-label="Meter readings date">
          <span>Date:</span>
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
        </div>
      </header>

      <div className={styles.meterHead} aria-hidden="true">
        <span>Fuel Beginnings</span>
        <span>Fuel Endings</span>
      </div>
      <table className={styles.meters}>
        <tbody>
          <tr>
            <td>
              <label><span>N:</span><input aria-label="North lane fuel beginning" value={data.fuelBeginningNorth} onChange={(event) => setField("fuelBeginningNorth", event.target.value)} readOnly={!onChange} /></label>
            </td>
            <td>
              <label><span>N:</span><input aria-label="North lane fuel ending" value={data.fuelEndingNorth} onChange={(event) => setField("fuelEndingNorth", event.target.value)} readOnly={!onChange} /></label>
            </td>
          </tr>
          <tr>
            <td>
              <label><span>S:</span><input aria-label="South lane fuel beginning" value={data.fuelBeginningSouth} onChange={(event) => setField("fuelBeginningSouth", event.target.value)} readOnly={!onChange} /></label>
            </td>
            <td>
              <label><span>S:</span><input aria-label="South lane fuel ending" value={data.fuelEndingSouth} onChange={(event) => setField("fuelEndingSouth", event.target.value)} readOnly={!onChange} /></label>
            </td>
          </tr>
        </tbody>
      </table>

      <section className={styles.wash}>
        <div className={styles.washLine}>
          {check("busesWashed", "Buses washed from")}
          {timeInputs("washStart", "Bus wash start time")}
          <span>to</span>
          {timeInputs("washEnd", "Bus wash end time")}
        </div>
        {check("busesNotWashed", "Buses not washed")}
      </section>

      <section className={styles.reason}>
        <h2>Reasoning for no bus wash / partial bus wash:</h2>
        <textarea
          aria-label="Reason for no or partial bus wash"
          value={data.reason}
          onChange={(event) => setField("reason", event.target.value)}
          readOnly={!onChange}
        />
      </section>

      <section className={styles.probes}>
        <h2>DATA PROBE NUMBERS:</h2>
        <label>
          <span>N. LANE -</span>
          <input aria-label="North lane data probe number" value={data.probeNorth} onChange={(event) => setField("probeNorth", event.target.value)} readOnly={!onChange} />
        </label>
        <label>
          <span>S. LANE -</span>
          <input aria-label="South lane data probe number" value={data.probeSouth} onChange={(event) => setField("probeSouth", event.target.value)} readOnly={!onChange} />
        </label>
      </section>

      <SheetRevision sheetId="meter-readings" />
    </PaperPage>
  );
}
