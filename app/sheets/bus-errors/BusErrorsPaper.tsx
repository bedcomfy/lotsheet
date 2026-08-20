import { PaperPage, SheetRevision } from "../core";
import { LETTER_PORTRAIT } from "../core/profiles";
import {
  BUS_ERROR_ROW_COUNT,
  createBlankBusErrorRow,
  type BusErrorRow,
  type BusErrorsData,
} from "./schema";
import styles from "./BusErrorsPaper.module.css";

interface BusErrorsPaperProps {
  data: BusErrorsData;
  onChange?: (next: BusErrorsData) => void;
}

export function BusErrorsPaper({ data, onChange }: BusErrorsPaperProps) {
  const rows = Array.from(
    { length: Math.max(BUS_ERROR_ROW_COUNT, data.rows.length) },
    (_, index) => data.rows[index] || createBlankBusErrorRow(),
  );

  function setRow(index: number, field: keyof BusErrorRow, value: string) {
    const nextRows = [...rows];
    nextRows[index] = { ...nextRows[index], [field]: value };
    onChange?.({ ...data, rows: nextRows });
  }

  return (
    <PaperPage
      profile={LETTER_PORTRAIT}
      sheetId="bus-errors"
      pageNumber={1}
      className={styles.page}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo.png" alt="Pace" />

      <table className={styles.table}>
        <colgroup>
          <col className={styles.busColumn} />
          <col className={styles.smallColumn} />
          <col className={styles.smallColumn} />
          <col className={styles.descriptionColumn} />
          <col className={styles.servicerColumn} />
        </colgroup>
        <thead>
          <tr className={styles.instructionsRow}>
            <th className={styles.busBeing}>BUS BEING<br />FUELED</th>
            <td className={styles.openHeader} colSpan={2} />
            <th className={styles.instructions}>
              <span><strong>BUS ERRORS</strong><b>WRONG BUS NUMBER READ BY</b></span>
              <span>COMPUTER enter what computer thought it was OR</span>
              <span>SYSTEM WILL NOT TAKE BUS NUMBER</span>
            </th>
            <td className={styles.openHeader} />
          </tr>
          <tr>
            <td className={styles.blackedOut} aria-label="Bus being fueled" />
            <th>Fuel</th>
            <th>Oil</th>
            <th>Discriptions of Error</th>
            <th>Servicer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {(
                ["bus", "fuel", "oil", "description", "servicer"] as const
              ).map((field) => (
                <td key={field}>
                  <input
                    aria-label={`Row ${index + 1} ${field}`}
                    value={row[field]}
                    onChange={(event) =>
                      setRow(index, field, event.target.value)
                    }
                    readOnly={!onChange}
                    inputMode={field === "bus" ? "numeric" : undefined}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <SheetRevision sheetId="bus-errors" />
    </PaperPage>
  );
}
