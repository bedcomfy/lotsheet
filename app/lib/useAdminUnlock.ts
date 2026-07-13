"use client";

import { create } from "zustand";
import { ADMIN_PASSWORD, ADMIN_SESSION_KEY } from "./admin";

// Shared "view is open, editing is gated" unlock, now a single Zustand store so
// every consumer (Seniority, Work Pick, AdminGate, the unlock button) reacts to
// the same unlocked state instead of each keeping its own copy synced through
// sessionStorage. Same password/session as Admin Tools — unlocking anywhere
// unlocks everywhere for the session. The API is unchanged.
interface AdminUnlockState {
  unlocked: boolean;
  tryUnlock: (password: string) => boolean;
  lock: () => void;
}

export const useAdminUnlock = create<AdminUnlockState>((set) => ({
  unlocked: false,
  tryUnlock: (password) => {
    if (password.trim().toLowerCase() !== ADMIN_PASSWORD) return false;
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
  },
}));

// Restore a prior unlock on the client AFTER hydration — the store starts locked
// (matching SSR), so this is a normal post-hydration state update, not a mismatch.
if (typeof window !== "undefined") {
  try {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      useAdminUnlock.setState({ unlocked: true });
    }
  } catch {}
}
