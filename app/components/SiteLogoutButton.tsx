"use client";

import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { ADMIN_SESSION_KEY } from "../lib/admin";
import { GATE_UNLOCK_PATH, SITE_LOGOUT_KEY } from "../lib/siteSession";
import { Button } from "../ui";
import styles from "./AdminLogoutButton.module.css";

// Ends the site session: the server drops the unlock cookie (and the admin
// cookie with it), other open tabs lock through localStorage, and this tab
// lands on the decoy at the site root.
export default function SiteLogoutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    const ok = await fetch(GATE_UNLOCK_PATH, { method: "DELETE" })
      .then((response) => response.ok)
      .catch(() => false);
    if (!ok) {
      setBusy(false);
      setError("Couldn't log out. Try again.");
      return;
    }
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.setItem(SITE_LOGOUT_KEY, `${Date.now()}-${Math.random()}`);
    } catch {}
    window.location.assign("/");
  }

  return (
    <div className={styles.control}>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Log out"
        isDisabled={busy}
        onPress={() => { void logout(); }}
      >
        <DoorOpen aria-hidden="true" />
        {!compact && (busy ? "Logging out…" : "Log out")}
      </Button>
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  );
}
