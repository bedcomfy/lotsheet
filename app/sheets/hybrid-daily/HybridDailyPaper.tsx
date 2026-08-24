import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import {
  hybridDailyDayLabel,
  type HybridDailyData,
} from "./schema";
import styles from "./HybridDailyPaper.module.css";

interface HybridDailyPaperProps {
  data: HybridDailyData;
  busNumbers: string[];
  dateOverride?: string;
}

const ROW_COUNT = 20;

export function HybridDailyPaper({
  data,
  busNumbers,
  dateOverride = "",
}: HybridDailyPaperProps) {
  const sortedBuses = [...busNumbers].sort(
    (left, right) => Number(left) - Number(right) || left.localeCompare(right),
  );
  const date = dateOverride || data.date;
  const day = hybridDailyDayLabel(date);

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="hybrid-daily"
      pageNumber={1}
      className={styles.page}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <header className={styles.header}>
        <h1>Hybrid Bus Daily Servicing Log</h1>
        <div className={styles.date}>
          {day ? `${day}  ` : ""}{date}
        </div>
      </header>

      <div className={styles.rule} />

      <table className={styles.table} aria-label="Hybrid daily servicing log">
        <colgroup>
          <col className={styles.busColumn} />
          <col className={styles.fuelColumn} />
          <col className={styles.defColumn} />
          <col className={styles.fareboxColumn} />
          <col className={styles.pumpColumn} />
          <col className={styles.cleaningColumn} />
          <col className={styles.notesColumn} />
          <col className={styles.servicerColumn} />
        </colgroup>
        <thead>
          <tr>
            <th>BUS</th>
            <th>FUEL</th>
            <th>DEF</th>
            <th>FAREBOX PROBED</th>
            <th>BUS NUMBER READ BY PUMP</th>
            <th className={styles.cleaningHeader}>DOES BUS NEED CLEANING</th>
            <th>ISSUES / NOTES</th>
            <th>SERVICER</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROW_COUNT }, (_, row) => {
            const busNumber = sortedBuses[row] || "";

            return (
              <tr key={row}>
                {busNumber ? (
                  <th scope="row">
                    <span className={styles.busNumber}>{busNumber}</span>
                  </th>
                ) : (
                  <td className={styles.busCell} />
                )}
                <td />
                <td />
                <td className={styles.choice}>Y&nbsp;&nbsp;-&nbsp;&nbsp;N</td>
                <td />
                <td className={styles.choice}>Y&nbsp;&nbsp;-&nbsp;&nbsp;N</td>
                <td />
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>

      <SheetRevision sheetId="hybrid-daily" />
    </PaperPage>
  );
}
