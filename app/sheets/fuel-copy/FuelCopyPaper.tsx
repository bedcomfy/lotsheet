import { Fragment, type ReactNode } from "react";
import { fuelIndicator } from "../../lib/grid";
import type { FlagMap } from "../../lib/types";
import { SheetRevision } from "../core";
import type { RevisionSheetId } from "../core/revisions";
import { buildFuelCopyColumns } from "./columns";
import styles from "./FuelCopyPaper.module.css";

interface FuelCopyPaperProps {
  sheetId: RevisionSheetId;
  label: string;
  busNumbers: string[];
  title: string;
  titleLine?: boolean;
  dateLabel?: string;
  date: string;
  entryLabel: string;
  blank?: boolean;
  flags?: FlagMap;
  renderEntry: (bus: string, field: "value" | "serv", className: string) => ReactNode;
}

export function FuelCopyPaper({
  sheetId, label, busNumbers, title, titleLine = false, dateLabel = "DATE", date,
  entryLabel, blank = false, flags = {}, renderEntry,
}: FuelCopyPaperProps) {
  const { columns, rows, total } = buildFuelCopyColumns(busNumbers);

  function groupCells(group: number, row: number) {
    if (group === 3 && row === rows - 1) return (
      <Fragment key={group}>
        <td className={styles.bus} />
        <td className={styles.total} colSpan={2}>Total: {total}</td>
      </Fragment>
    );
    const bus = columns[group][row];
    if (!bus) return <Fragment key={group}><td /><td /><td /></Fragment>;
    const indicator = blank ? "" : fuelIndicator(flags[bus]);
    return (
      <Fragment key={group}>
        <td className={`${styles.bus} ${indicator ? styles.flagged : ""}`} data-bus={bus}>
          <span className={styles.busContent}>
            {indicator && <span className={styles.indicator}>
              <span className={`${styles.indicatorLetter} ${indicator === "*" ? styles.asterisk : ""}`}>{indicator}</span>
            </span>}
            <span className={styles.busNumber}>{bus}</span>
          </span>
        </td>
        <td>{!blank && renderEntry(bus, "value", styles.input)}</td>
        <td>{!blank && renderEntry(bus, "serv", styles.input)}</td>
      </Fragment>
    );
  }

  return (
    <div className={styles.page} data-paper-page="" data-paper-profile="letter-portrait" data-sheet-id={sheetId}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />
      <table className={styles.table} aria-label={label}>
        <colgroup>
          {Array.from({ length: 4 }, (_, group) => <Fragment key={group}>
            <col className={styles.busColumn} /><col className={styles.entryColumn} /><col className={styles.entryColumn} />
          </Fragment>)}
        </colgroup>
        <tbody>
          <tr className={styles.header}>
            <td colSpan={6}>
              <span className={`${styles.title} ${titleLine ? styles.titleLine : ""}`} data-sheet-title="">{title || "\u00a0"}</span>
            </td>
            <td colSpan={6}>{dateLabel}: <span className={styles.date}>{blank ? "" : date}</span></td>
          </tr>
          <tr className={styles.columnHeaders}>
            {Array.from({ length: 4 }, (_, group) => <Fragment key={group}>
              <td>BUS</td><td>{entryLabel}</td><td>SERV</td>
            </Fragment>)}
          </tr>
          {Array.from({ length: rows }, (_, row) => <tr key={row}>
            {[0, 1, 2, 3].map((group) => groupCells(group, row))}
          </tr>)}
        </tbody>
      </table>
      <SheetRevision sheetId={sheetId} />
    </div>
  );
}
