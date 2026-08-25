import { Fragment } from "react";
import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import {
  cleaningMonthLabel,
  type MonthlyCleaningData,
} from "./schema";
import styles from "./MonthlyCleaningPaper.module.css";

interface MonthlyCleaningPaperProps {
  data: MonthlyCleaningData;
  busNumbers: string[];
  blank?: boolean;
  onChange?: (next: MonthlyCleaningData) => void;
}

type MonthlyCleaningEntryKey = "date" | "serv";

const GROUP_COUNT = 4;
const MIN_ROWS = 35;

export function buildMonthlyCleaningColumns(busNumbers: string[]) {
  const buses = [...busNumbers].sort(
    (left, right) => Number(left) - Number(right) || left.localeCompare(right),
  );
  const rows = Math.max(MIN_ROWS, Math.ceil((buses.length + 1) / GROUP_COUNT));
  const columns: (string | null)[][] = Array.from(
    { length: GROUP_COUNT },
    () => [],
  );
  buses.forEach((bus, index) => {
    columns[Math.floor(index / rows)][index % rows] = bus;
  });
  columns.forEach((column) => {
    while (column.length < rows) column.push(null);
  });
  return { buses, columns, rows, total: buses.length };
}

function sanitizeCleaningDate(value: string): string {
  return value.replace(/[^0-9/.-]/g, "").slice(0, 8);
}

function sanitizeServicer(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function MonthlyCleaningPaper({
  data,
  busNumbers,
  blank = false,
  onChange,
}: MonthlyCleaningPaperProps) {
  const { columns, rows, total } = buildMonthlyCleaningColumns(busNumbers);
  const month = blank ? "" : cleaningMonthLabel(data.month);

  function setEntry(
    bus: string,
    key: MonthlyCleaningEntryKey,
    rawValue: string,
  ) {
    if (!onChange) return;
    const value = key === "date"
      ? sanitizeCleaningDate(rawValue)
      : sanitizeServicer(rawValue);
    const current = data.entries[bus] || { date: "", serv: "" };
    const nextEntry = { ...current, [key]: value };
    const entries = { ...data.entries };
    if (!nextEntry.date && !nextEntry.serv) delete entries[bus];
    else entries[bus] = nextEntry;
    onChange({ ...data, entries });
  }

  function entryCell(bus: string, key: MonthlyCleaningEntryKey) {
    const value = blank ? "" : String(data.entries[bus]?.[key] || "");
    if (!onChange || blank) return value;
    return (
      <input
        className={styles.entryInput}
        inputMode="numeric"
        aria-label={`Bus ${bus} ${key === "date" ? "cleaning date" : "servicer"}`}
        value={value}
        onChange={(event) => setEntry(bus, key, event.target.value)}
      />
    );
  }

  function groupCells(group: number, row: number) {
    if (group === GROUP_COUNT - 1 && row === rows - 1) {
      return (
        <Fragment key={group}>
          <td />
          <td className={styles.total} colSpan={2}>Total: {total}</td>
        </Fragment>
      );
    }
    const bus = columns[group][row];
    if (!bus) {
      return (
        <Fragment key={group}>
          <td />
          <td />
          <td />
        </Fragment>
      );
    }
    return (
      <Fragment key={group}>
        <th scope="row" className={styles.bus}>{bus}</th>
        <td>{entryCell(bus, "date")}</td>
        <td>{entryCell(bus, "serv")}</td>
      </Fragment>
    );
  }

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="monthly-cleaning"
      pageNumber={1}
      className={styles.page}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <table className={styles.table} aria-label="Monthly bus cleaning roster">
        <colgroup>
          {Array.from({ length: GROUP_COUNT }, (_, group) => (
            <Fragment key={group}>
              <col className={styles.busColumn} />
              <col className={styles.entryColumn} />
              <col className={styles.entryColumn} />
            </Fragment>
          ))}
        </colgroup>
        <thead>
          <tr className={styles.titleRow}>
            <th colSpan={12}>
              <span>Bus Cleaning Month of</span>
              <span className={styles.monthLine}>{month}</span>
            </th>
          </tr>
          <tr className={styles.columnHeaders}>
            {Array.from({ length: GROUP_COUNT }, (_, group) => (
              <Fragment key={group}>
                <th>BUS</th>
                <th>DATE</th>
                <th>SERV</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: GROUP_COUNT }, (_, group) =>
                groupCells(group, row),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <SheetRevision sheetId="monthly-cleaning" />
    </PaperPage>
  );
}
