import {
  PM_STATUS_LABEL, TRANS_PM_NOTE, formatMiles, formatOdometer, groupPmWorkItems,
  type PmFilter, type PmSettings, type PmWorkItem,
} from "../../lib/pmMileage";
import { serviceTimeParts } from "../../lib/vehicleServiceReport";
import styles from "./PmMileagePaper.module.css";

export interface PmMileagePaperProps {
  items: PmWorkItem[];
  labels: Record<string, string>;
  settings: PmSettings;
  date: string;
  filter: PmFilter;
  query: string;
}

// Natural table pagination keeps variable-length notes intact. Repeated table
// headers identify the section on every page; no application controls or colors.
export function PmMileagePaper({ items: allItems, labels, date, filter, query }: PmMileagePaperProps) {
  // The screen remains a full fleet queue; paper is the next 1,000 miles of work.
  const items = allItems.filter((item) => item.milesLeft !== null && item.milesLeft <= 1000);
  const groups = groupPmWorkItems(items);
  const busCount = new Set(items.map((item) => item.record.bus)).size;
  return (
    <article className={styles.paper} data-pm-paper="" data-paper-profile="letter-portrait">
      <header className={styles.title}>
        <h1>PM Mileage</h1>
        <p>{date} · {items.length} PMs · {busCount} {busCount === 1 ? "bus" : "buses"}</p>
        <p>Overdue and due through +1,000 miles · Negative miles are overdue · Service times: Chicago</p>
        {(filter !== "all" || query.trim()) && <p className={styles.scope}>Showing: {filter === "all" ? "All PMs" : PM_STATUS_LABEL[filter]}{query.trim() ? ` · Search: ${query.trim()}` : ""}</p>}
      </header>
      {groups.length === 0 && <p>No PMs due within 1,000 miles match this view.</p>}
      {groups.map((group) => (
        <table className={styles.table} key={group.id} aria-label={group.title}>
          <colgroup>
            <col className={styles.busColumn} /><col className={styles.odometerColumn} />
            <col className={styles.serviceColumn} />
            <col className={styles.workColumn} /><col className={styles.milesColumn} />
            <col />
          </colgroup>
          <thead>
            <tr><th className={styles.section} colSpan={6}>PM Mileage · {group.title}<span> · {group.items.length} PMs</span></th></tr>
            <tr><th scope="col">Bus</th><th scope="col">Odometer</th><th scope="col">Last serviced / last odometer reading time</th><th scope="col">Next PM / Due at</th><th scope="col">Miles left</th><th scope="col">Note</th></tr>
          </thead>
          <tbody>
            {group.items.map((item) => {
              const r = item.record;
              const serviceTime = serviceTimeParts(r.lastServiceAt);
              return (
                <tr key={item.id} data-pm-id={item.id}>
                  <td><strong>{r.bus}</strong>{labels[r.bus] && labels[r.bus] !== r.bus && <span>{labels[r.bus]}</span>}</td>
                  <td>{r.odometer === null ? "Not recorded" : formatOdometer(r.odometer)}
                    {!serviceTime && r.odometerDate && <span>Reading: {r.odometerDate}</span>}
                  </td>
                  <td>
                    {serviceTime ? <><span>{serviceTime.date}</span><span>{serviceTime.time}</span>
                      {r.lastServiceMiles !== null && r.lastServiceMiles !== r.odometer && <span>at {formatOdometer(r.lastServiceMiles)} mi</span>}</>
                      : "Not recorded"}
                  </td>
                  <td><strong>{item.kind === "trans" ? "Trans PM" : item.type || "Inspection"}</strong><span>{item.dueMiles === null ? "Not scheduled" : `at ${formatMiles(item.dueMiles)}`}</span></td>
                  <td><strong>{item.milesLeft === null ? "Unknown" : `${item.milesLeft > 0 ? "+" : ""}${formatMiles(item.milesLeft)}`}</strong></td>
                  <td>
                    {item.kind === "trans" && <div className={styles.note}>{TRANS_PM_NOTE}</div>}
                    {r.note ? <div className={styles.note}>{r.note}</div> : item.kind !== "trans" ? "-" : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </article>
  );
}
