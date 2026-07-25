"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import { AppPage, Button, PageHeader, Panel, TextField } from "../ui";
import styles from "./AdminGate.module.css";

export default function AdminGate({ children }: { children: ReactNode }) {
  const { unlocked, tryUnlock } = useAdminUnlock();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function unlock() {
    if (!tryUnlock(password)) setError(true);
  }

  if (unlocked) return <>{children}</>;

  return (
    <AppPage className={styles.page}>
      <PageHeader
        eyebrow="Admin Tools"
        title="Protected Settings"
        description="These controls change how the shared sheets behave for everyone."
      />
      <Panel
        className={styles.panel}
        title="Unlock Admin Tools"
        description="Use the same password as Bus Lists."
      >
        <div className={styles.form}>
          <TextField
            label="Password"
            type="password"
            placeholder="Enter admin password"
            value={password}
            autoFocus
            isInvalid={error}
            errorMessage={error ? "Wrong password." : undefined}
            onChange={(value) => {
              setPassword(value);
              setError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") unlock();
            }}
          />
          <Button variant="primary" size="lg" onPress={unlock}>
            Unlock
          </Button>
        </div>
      </Panel>
    </AppPage>
  );
}
