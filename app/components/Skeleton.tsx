// Chrome-only loading placeholders. Paper sheets never render these.
import { Skeleton } from "../ui";
import styles from "./Skeleton.module.css";

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.rows} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className={styles.row} key={index} />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return <Skeleton className={styles.stat} aria-hidden="true" />;
}
