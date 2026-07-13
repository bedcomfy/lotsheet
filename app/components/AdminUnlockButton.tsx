"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

// The "Edit" affordance on view-open / edit-gated pages (Seniority, Work Pick).
// Parent owns the unlock state (via useAdminUnlock) and passes tryUnlock as
// onSubmit; this only handles the inline password prompt. Rendered only while
// locked — once unlocked the parent swaps in its own editing toolbar.
export default function AdminUnlockButton({
  onSubmit,
  label = "Edit",
}: {
  onSubmit: (password: string) => boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        <Lock size={15} /> {label}
      </button>
    );
  }

  function submit() {
    if (onSubmit(password)) {
      setOpen(false);
      setPassword("");
      setError(false);
    } else {
      setError(true);
    }
  }

  return (
    <div className="unlockbar">
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
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button className="btn btn--primary" onClick={submit}>Unlock</button>
      <button className="btn" onClick={() => { setOpen(false); setPassword(""); setError(false); }}>Cancel</button>
      {error && <span className="unlockbar__err">Wrong password.</span>}
    </div>
  );
}
