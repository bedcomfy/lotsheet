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

// Renders a bus's type code(s), each in its colour, joined with a dash:
// e.g. P  /  HEV  or  COACH / 30'. Standard buses (no types) render nothing.
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
  return (
    <span className={`typecodes ${className}`}>
      {visible.map((ti, i) => (
        <span key={ti.id} className="typecodes__seg">
          {i > 0 && <span className="typecodes__sep">/</span>}
          <span className="badge" style={{ color: ti.color }}>
            {ti.code}
          </span>
        </span>
      ))}
    </span>
  );
}
