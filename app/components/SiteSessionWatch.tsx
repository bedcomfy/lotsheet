"use client";

import { useEffect } from "react";
import { GATE_UNLOCK_PATH, SITE_LOGOUT_KEY } from "../lib/siteSession";

// Keeps the unlocked app honest about its 30-minute site session: asks the
// server when the session ends, reloads into the decoy at that moment, checks
// again whenever the tab comes back into view (a phone that slept past the
// deadline), and locks when another tab logs out. Renders nothing.
export default function SiteSessionWatch() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const lock = () => window.location.reload();
    const check = async () => {
      const data = await fetch(GATE_UNLOCK_PATH, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
      if (cancelled || !data) return;
      const expiresAt = Number(data.session?.expiresAt);
      if (!expiresAt) {
        lock();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(lock, Math.max(1000, expiresAt - Date.now() + 1000));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SITE_LOGOUT_KEY) lock();
    };

    void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
