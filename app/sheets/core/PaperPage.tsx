import type { CSSProperties, HTMLAttributes } from "react";
import type { PaperProfile } from "./types";
import styles from "./PaperPage.module.css";

interface PaperPageProps extends HTMLAttributes<HTMLElement> {
  profile: PaperProfile;
  pageNumber?: number;
  sheetId?: string;
}

export function PaperPage({
  profile,
  pageNumber,
  sheetId,
  className,
  style,
  children,
  ...props
}: PaperPageProps) {
  return (
    <section
      {...props}
      className={`${styles.page}${className ? ` ${className}` : ""}`}
      data-paper-page=""
      data-paper-profile={profile.id}
      data-sheet-id={sheetId}
      data-page-number={pageNumber}
      style={{
        "--paper-width-in": profile.widthIn,
        "--paper-height-in": profile.heightIn,
        ...style,
      } as CSSProperties}
    >
      {children}
    </section>
  );
}
