"use client";

// Buses — a big numeric search. Four digits of a known bus opens its card
// immediately.

import { useState } from "react";
import { useBusMaster } from "../BusMasterProvider";
import { sanitizeBus } from "../../lib/buses";
import { SearchField } from "../../ui";
import styles from "./MApp.module.css";

export default function MBuses({ onOpenBus }: { onOpenBus: (bus: string) => void }) {
  const { isKnown } = useBusMaster();
  const [q, setQ] = useState("");

  function onType(raw: string) {
    const v = sanitizeBus(raw);
    setQ(v);
    if (v.length >= 4 && isKnown(v)) {
      onOpenBus(v);
      setQ("");
    }
  }

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

      <div className={styles.hint}>
        Type a bus number → its card: where it sits, its flags, tonight's service, and one-tap flagging.
      </div>
    </>
  );
}
