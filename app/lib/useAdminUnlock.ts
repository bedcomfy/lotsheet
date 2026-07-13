"use client";

import { useCallback, useState } from "react";
import { ADMIN_PASSWORD, ADMIN_SESSION_KEY } from "./admin";

// Shared "view is open, editing is gated" unlock. Reuses the same password and
// session flag as Admin Tools, so unlocking here (or there) unlocks both for the
// session. Unlike AdminGate, this never blocks rendering — pages call it and
// only reveal edit controls when `unlocked` is true.
export function useAdminUnlock(): {
  unlocked: boolean;
  tryUnlock: (password: string) => boolean;
  lock: () => void;
} {
  const [unlocked, setUnlocked] = useState<boolean>(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"
  );

  const tryUnlock = useCallback((password: string): boolean => {
    if (password.trim().toLowerCase() !== ADMIN_PASSWORD) return false;
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    } catch {}
    setUnlocked(true);
    return true;
  }, []);

  const lock = useCallback(() => {
    // Clear the shared session so "Done" locks everywhere consistently — other
    // gated pages (and the sibling Staffing tab) read the same flag on mount.
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {}
    setUnlocked(false);
  }, []);

  return { unlocked, tryUnlock, lock };
}
