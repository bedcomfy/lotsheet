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
  tryUnlock: (password: string) => Promise<boolean>;
  lock: () => void;
}

export const useAdminUnlock = create<AdminUnlockState>((set) => ({
  unlocked: false,
  tryUnlock: async (password) => {
    const ok = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then((response) => response.ok)
      .catch(() => false);
    if (!ok) return false;
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    } catch {}
    set({ unlocked: true });
    return true;
  },
  lock: () => {
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {}
    set({ unlocked: false });
    fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
  },
}));

// Restore a prior unlock on the client AFTER hydration — the store starts locked
// (matching SSR). The server confirms the cookie is still good, so a stale
// "unlocked" flag never outlives an expired session.
if (typeof window !== "undefined") {
  try {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      fetch("/api/admin/session", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : { unlocked: false }))
        .then((data) => {
          if (data?.unlocked) useAdminUnlock.setState({ unlocked: true });
          else sessionStorage.removeItem(ADMIN_SESSION_KEY);
        })
        .catch(() => {});
    }
  } catch {}
}
