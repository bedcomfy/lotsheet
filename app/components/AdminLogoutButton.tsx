"use client";

import { LogOut } from "lucide-react";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import { Button } from "../ui";
import styles from "./AdminLogoutButton.module.css";

export default function AdminLogoutButton({ compact = false }: { compact?: boolean }) {
  const { unlocked, locking, lockError, lock } = useAdminUnlock();
  if (!unlocked && !locking) return null;
  return (
    <div className={styles.control}>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Log out of admin"
        isDisabled={locking}
        onPress={() => { void lock(); }}
      >
        <LogOut aria-hidden="true" />
        {!compact && (locking ? "Logging out…" : "Log out of admin")}
      </Button>
      {lockError && <span className={styles.error} role="alert">{lockError}</span>}
    </div>
  );
}
