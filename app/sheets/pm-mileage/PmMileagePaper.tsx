import {
  PM_DISPOSITION_LABEL, PM_STATUS_LABEL, formatMiles, groupPmWorkItems,
  type PmFilter, type PmSettings, type PmWorkItem,
} from "../../lib/pmMileage";
import type { FlagMap } from "../../lib/types";
import styles from "./PmMileagePaper.module.css";

export interface PmMileagePaperProps {
  items: PmWorkItem[];
  labels: Record<string, string>;
  flags: FlagMap;
  settings: PmSettings;
  date: string;
  filter: PmFilter;
  query: string;
}

// Natural table pagination keeps variable-length notes intact. Repeated table
// headers identify the section on every page; no application controls or colors.
export function PmMileagePaper({ items, labels, flags, settings, date, filter, query }: PmMileagePaperProps) {
  const groups = groupPmWorkItems(items);
  const busCount = new Set(items.map((item) => item.record.bus)).size;
  return (
    <article className={styles.paper} data-pm-paper="" data-paper-profile="letter-portrait">
      <header className={styles.title}>
        <h1>PM Mileage</h1>
        <p>{date} · {items.length} PMs · {busCount} {busCount === 1 ? "bus" : "buses"}</p>
        <p>Due soon: 0 to {formatMiles(settings.dueSoonMiles)} miles. Negative miles are overdue.</p>
        <p>Shop / Follow up first. Hold and Split remain in mileage order. Each PM is listed separately.</p>
        {(filter !== "all" || query.trim()) && <p className={styles.scope}>Showing: {filter === "all" ? "All PMs" : PM_STATUS_LABEL[filter]}{query.trim() ? ` · Search: ${query.trim()}` : ""}</p>}
      </header>
      {groups.length === 0 && <p>No PMs match this view.</p>}
      {groups.map((group) => (
        <table className={styles.table} key={group.id} aria-label={group.title}>
          <colgroup>
            <col className={styles.busColumn} /><col className={styles.odometerColumn} />
            <col className={styles.workColumn} /><col className={styles.milesColumn} />
            <col className={styles.statusColumn} /><col />
          </colgroup>
          <thead>
            <tr><th className={styles.section} colSpan={6}>PM Mileage · {group.title} <span>{group.items.length} PMs</span></th></tr>
            <tr><th scope="col">Bus</th><th scope="col">Odometer / As of</th><th scope="col">Next PM / Due at</th><th scope="col">Miles left</th><th scope="col">Status / Flags</th><th scope="col">Note</th></tr>
          </thead>
          <tbody>
            {group.items.map((item) => {
              const r = item.record;
              const busFlags = (flags[r.bus]?.flags || []).filter((flag) => flag === "hold" || flag === "split");
              const statuses = [...new Set([
                ...(r.disposition ? [PM_DISPOSITION_LABEL[r.disposition].toUpperCase()] : []),
                ...busFlags.map((flag) => flag.toUpperCase()),
              ])];
              return (
                <tr key={item.id} data-pm-id={item.id}>
                  <td><strong>{r.bus}</strong>{labels[r.bus] && labels[r.bus] !== r.bus && <span>{labels[r.bus]}</span>}</td>
                  <td>{r.odometer === null ? "Not recorded" : formatMiles(r.odometer)}<span>{r.odometerDate || "Date not recorded"}</span></td>
                  <td><strong>{item.kind === "trans" ? "Trans PM" : item.type || "Inspection"}</strong><span>{item.dueMiles === null ? "Not scheduled" : `at ${formatMiles(item.dueMiles)}`}</span></td>
                  <td><strong>{item.milesLeft === null ? "Unknown" : `${item.milesLeft > 0 ? "+" : ""}${formatMiles(item.milesLeft)}`}</strong><span className={styles.urgency}>{PM_STATUS_LABEL[item.status]}</span></td>
                  <td className={styles.status}>{statuses.length ? statuses.join(" / ") : "-"}</td>
                  <td>{r.note || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </article>
  );
}
