"use client";

import { create } from "zustand";
import { ADMIN_SESSION_KEY } from "./admin";

// Shared "view is open, editing is gated" unlock — one Zustand store so every
// consumer (Seniority, Work Pick, AdminGate, the unlock button) reacts to the
// same state. The password is checked by the server, which answers with an
// httpOnly session cookie that the admin write routes require; unlocking
// anywhere unlocks everywhere for the session.
interface AdminUnlockState {
  unlocked: boolean;
  locking: boolean;
  lockError: string;
  tryUnlock: (password: string) => Promise<boolean>;
  lock: () => Promise<boolean>;
}

const LOGOUT_KEY = "pace:admin-logout";
let sessionRevision = 0;

export const useAdminUnlock = create<AdminUnlockState>((set, get) => ({
  unlocked: false,
  locking: false,
  lockError: "",
  tryUnlock: async (password) => {
    if (get().locking) return false;
    const revision = ++sessionRevision;
    const ok = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then((response) => response.ok)
      .catch(() => false);
    if (!ok || revision !== sessionRevision) return false;
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    } catch {}
    set({ unlocked: true, lockError: "" });
    return true;
  },
  lock: async () => {
    if (get().locking) return false;
    ++sessionRevision;
    set({ locking: true, lockError: "" });
    const ok = await fetch("/api/admin/session", { method: "DELETE" })
      .then((response) => response.ok).catch(() => false);
    if (!ok) {
      set({ locking: false, lockError: "Couldn't log out of admin. Try again." });
      return false;
    }
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.setItem(LOGOUT_KEY, `${Date.now()}-${Math.random()}`);
    } catch {}
    set({ unlocked: false, locking: false, lockError: "" });
    return true;
  },
}));

// Restore a prior unlock on the client AFTER hydration — the store starts locked
// (matching SSR). The server confirms the cookie is still good, so a stale
// "unlocked" flag never outlives an expired session.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== LOGOUT_KEY) return;
    ++sessionRevision;
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
    useAdminUnlock.setState({ unlocked: false, locking: false, lockError: "" });
  });
  try {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      const revision = sessionRevision;
      fetch("/api/admin/session", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : { unlocked: false }))
        .then((data) => {
          if (revision !== sessionRevision) return;
          if (data?.unlocked) useAdminUnlock.setState({ unlocked: true });
          else sessionStorage.removeItem(ADMIN_SESSION_KEY);
        })
        .catch(() => {});
    }
  } catch {}
}
