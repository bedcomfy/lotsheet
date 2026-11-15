"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import { formatAccessRemaining, fusionNow, remainingAccessSeconds } from "../lib/fusion/clock";
import styles from "./FusionExpiryCountdown.module.css";

export function FusionExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(fusionNow());
    tick();
    const interval = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [expiresAt]);
  const seconds = now === null ? null : remainingAccessSeconds(expiresAt, now);
  const valid = Number.isFinite(expiresAt);
  return <div className={styles.countdown}>
    <span role="timer" aria-live="off" aria-label="Oracle access time remaining" data-remaining-seconds={seconds ?? undefined}>
      <StatusBadge icon={<Clock3 />} tone={seconds === 0 ? "danger" : seconds !== null && seconds <= 900 ? "warning" : "info"}>
        {seconds === null ? "Checking expiration…" : seconds === 0 ? "Access expired · reconnect" : `${formatAccessRemaining(seconds)} remaining`}
      </StatusBadge>
    </span>
    {valid && <span className={styles.deadline}>Expires <time dateTime={new Date(expiresAt).toISOString()}>
      {now === null ? "…" : new Date(expiresAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}
    </time></span>}
  </div>;
}
