import { Fragment } from "react";
import type { CSSProperties } from "react";
import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import {
  HYBRID_WEEKDAYS,
  hybridWeekDates,
  normalizeHybridWeekStart,
  type HybridWeeklyData,
} from "./schema";
import styles from "./HybridWeeklyPaper.module.css";

interface HybridWeeklyPaperProps {
  data: HybridWeeklyData;
  busNumbers: string[];
  dateOverride?: string;
}

const GROUP_COUNT = 3;
const MIN_ROWS_PER_GROUP = 4;

function busAt(
  buses: string[],
  group: number,
  row: number,
  rowsPerGroup: number,
): string {
  return buses[group * rowsPerGroup + row] || "";
}

export function HybridWeeklyPaper({
  data,
  busNumbers,
  dateOverride = "",
}: HybridWeeklyPaperProps) {
  const sortedBuses = [...busNumbers].sort(
    (left, right) => Number(left) - Number(right) || left.localeCompare(right),
  );
  const rowsPerGroup = Math.max(
    MIN_ROWS_PER_GROUP,
    Math.ceil(sortedBuses.length / GROUP_COUNT),
  );
  const weekStarting = normalizeHybridWeekStart(
    dateOverride || data.weekStarting,
  );
  const dates = hybridWeekDates(weekStarting);
  const weekLabel = dates[0] || "";

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="hybrid-weekly"
      pageNumber={1}
      className={styles.page}
      style={{ "--hybrid-data-rows": rowsPerGroup } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <header className={styles.header}>
        <h1>Hybrid Bus Weekly Servicing Log</h1>
        <div>Week of {weekLabel}</div>
      </header>

      <div className={styles.rule} />

      <div className={styles.days}>
        {HYBRID_WEEKDAYS.map((day, dayIndex) => (
          <table
            className={styles.dayTable}
            aria-label={`${day} ${dates[dayIndex]}`}
            key={day}
          >
            <colgroup>
              {Array.from({ length: GROUP_COUNT }, (_, group) => (
                <Fragment key={group}>
                  <col className={styles.busColumn} />
                  <col className={styles.entryColumn} />
                  <col className={styles.entryColumn} />
                  <col className={styles.entryColumn} />
                </Fragment>
              ))}
            </colgroup>
            <thead>
              <tr className={styles.dayHeading}>
                <td colSpan={4} />
                <th colSpan={4} scope="colgroup">
                  {day}&nbsp;&nbsp;{dates[dayIndex]}
                </th>
                <td colSpan={4} />
              </tr>
              <tr className={styles.labels}>
                {Array.from({ length: GROUP_COUNT }, (_, group) => (
                  <Fragment key={group}>
                    <th>BUS</th>
                    <th>FUEL</th>
                    <th>DEF</th>
                    <th>SERVICER</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowsPerGroup }, (_, row) => (
                <tr key={row}>
                  {Array.from({ length: GROUP_COUNT }, (_, group) => (
                    <Fragment key={group}>
                      {busAt(sortedBuses, group, row, rowsPerGroup) ? (
                        <th scope="row">
                          {busAt(sortedBuses, group, row, rowsPerGroup)}
                        </th>
                      ) : (
                        <td />
                      )}
                      <td />
                      <td />
                      <td />
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <SheetRevision sheetId="hybrid-weekly" />
    </PaperPage>
  );
}
