"use client";

import { typeInfo } from "../lib/grid";
import { useBusMaster } from "./BusMasterProvider";

interface TypeCodesProps {
  num: string;
  className?: string;
}

// Renders a bus's type code(s), each in its colour, joined with a dash:
// e.g. P  /  HEV  or  COACH / 30'. Standard buses (no types) render nothing.
export default function TypeCodes({ num, className = "" }: TypeCodesProps) {
  const { types: busTypes } = useBusMaster();
  const types: string[] = busTypes(num);
  if (!types.length) return null;
  return (
    <span className={`typecodes ${className}`}>
      {types.map((t, i) => {
        const ti = typeInfo(t);
        if (!ti) return null;
        return (
          <span key={t} className="typecodes__seg">
            {i > 0 && <span className="typecodes__sep">/</span>}
            <span className="badge" style={{ color: ti.color }}>
              {ti.code}
            </span>
          </span>
        );
      })}
    </span>
  );
}
