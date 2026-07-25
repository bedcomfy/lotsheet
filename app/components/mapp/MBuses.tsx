"use client";

// Buses — a big numeric search plus recent buses. Four digits of a known bus
// opens its card immediately.

import { useEffect, useState } from "react";
import { useFlags } from "../../lib/queries";
import { useBusMaster } from "../BusMasterProvider";
import { sanitizeBus } from "../../lib/buses";
import { Chip, SearchField } from "../../ui";
import styles from "./MApp.module.css";

const RECENT_KEY = "pace:m:recent";

export function pushRecent(bus: string) {
  try {
    const cur: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const next = [bus, ...cur.filter((b) => b !== bus)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

export default function MBuses({ onOpenBus }: { onOpenBus: (bus: string) => void }) {
  const { data: flags = {} } = useFlags();
  const { isKnown } = useBusMaster();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch {}
  }, []);

  function onType(raw: string) {
    const v = sanitizeBus(raw);
    setQ(v);
    if (v.length >= 4 && isKnown(v)) {
      onOpenBus(v);
      setQ("");
    }
  }

  const hasFlags = (bus: string) => ((flags[bus]?.flags || []).length > 0);

  return (
    <>
      <SearchField
        className={styles.search}
        label="Find bus"
        labelHidden
        placeholder="Bus number…"
        inputMode="numeric"
        value={q}
        onChange={onType}
        errorMessage={q.length >= 4 && !isKnown(q) ? `“${q}” isn't a known bus number.` : undefined}
        autoFocus
      />

      {recent.length > 0 && (
        <>
          <div className={styles.section}>Recent</div>
          <div className={styles.chips}>
            {recent.map((b) => (
              <Chip
                key={b}
                tone={hasFlags(b) ? "warning" : "neutral"}
                onPress={() => onOpenBus(b)}
              >
                {b}
              </Chip>
            ))}
          </div>
        </>
      )}

      <div className={styles.hint}>
        Type a bus number → its card: where it sits, its flags, tonight's service, and one-tap flagging.
      </div>
    </>
  );
}
