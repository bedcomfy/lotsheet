import { SHEET_REVISIONS, type RevisionSheetId } from "./revisions";
import styles from "./SheetRevision.module.css";

interface SheetRevisionProps {
  sheetId: RevisionSheetId;
  inline?: boolean;
  className?: string;
}

export function SheetRevision({
  sheetId,
  inline = false,
  className,
}: SheetRevisionProps) {
  return (
    <span
      className={`${styles.revision}${inline ? ` ${styles.inline}` : ""}${className ? ` ${className}` : ""}`}
      data-sheet-revision={sheetId}
    >
      Revised {SHEET_REVISIONS[sheetId]}
    </span>
  );
}
