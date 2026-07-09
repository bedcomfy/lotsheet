"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ADMIN_PASSWORD, ADMIN_SESSION_KEY } from "../lib/admin";

export default function AdminGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function unlock() {
    if (password.trim().toLowerCase() !== ADMIN_PASSWORD) {
      setError(true);
      return;
    }
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    } catch {}
    setUnlocked(true);
  }

  if (unlocked) return <>{children}</>;

  return (
    <main className="adminpage">
      <section className="adminhero">
        <div>
          <span className="adminhero__eyebrow">Admin Tools</span>
          <h1>Protected Settings</h1>
          <p>These controls change how the shared sheets behave for everyone.</p>
        </div>
      </section>
      <section className="adminpanel adminpanel--gate">
        <div>
          <h2>Unlock Admin Tools</h2>
          <p>Use the same password as Bus Lists.</p>
        </div>
        <div className="admingate">
          <input
            className="manager__search"
            type="password"
            placeholder="Password"
            value={password}
            autoFocus
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
          />
          <button className="btn btn--primary" onClick={unlock}>
            Unlock
          </button>
        </div>
        {error && <div className="pwgate__err">Wrong password.</div>}
      </section>
    </main>
  );
}
