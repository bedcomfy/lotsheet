"use client";

import type { CSSProperties } from "react";
import { typeInfo } from "../lib/grid";
import { useBusMaster } from "./BusMasterProvider";
import styles from "./TypeCodes.module.css";

interface TypeCodesProps {
  num: string;
  className?: string;
  variant?: "paper" | "ui";
}

// Renders a bus's type code(s), each in its colour. Application UI keeps the
// compact slash-separated form. On the Lot Sheet paper, the model tag sits
// above the wrap so both remain legible in the narrow cell corner.
export default function TypeCodes({ num, className = "", variant = "paper" }: TypeCodesProps) {
  const { types: busTypes } = useBusMaster();
  // Resolve to visible badges only (empty-code types like Standard render nothing),
  // so the "/" separators sit only between codes that actually show.
  const visible = busTypes(num)
    .map((t) => typeInfo(t))
    .filter((ti): ti is NonNullable<typeof ti> => !!ti && !!ti.code);
  if (!visible.length) return null;
  if (variant === "ui") {
    return (
      <span className={`${styles.codes} ${className}`.trim()}>
        {visible.map((ti, i) => (
          <span key={ti.id} className={styles.segment}>
            {i > 0 && <span className={styles.separator}>/</span>}
            <span
              className={styles.badge}
              style={{ "--type-color": ti.color } as CSSProperties}
            >
              {ti.code}
            </span>
          </span>
        ))}
      </span>
    );
  }
  const paperVisible = [...visible].sort((a, b) => {
    const rank = (kind: typeof a.kind) => (kind === "model" ? 0 : 1);
    return rank(a.kind) - rank(b.kind);
  });
  return (
    <span className={`typecodes ${className}`}>
      {paperVisible.map((ti) => (
        <span key={ti.id} className="typecodes__seg">
          <span className="badge" style={{ color: ti.color }}>
            {ti.code}
          </span>
        </span>
      ))}
    </span>
  );
}
