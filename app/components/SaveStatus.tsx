"use client";

// A quiet save indicator for the sheet toolbars: "Saving…" while a write is in
// flight, "Saved" for a moment after, and a persistent warning when a save was
// rejected — so a servicer never walks away from a sheet that didn't stick.
// (The last-saved timestamps were removed on request; this is state, not time.)

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Check, LoaderCircle } from "lucide-react";
import styles from "./SaveStatus.module.css";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useSaveState(): [SaveState, (next: SaveState) => void] {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mark = useCallback((next: SaveState) => {
    clearTimeout(timer.current);
    setState(next);
    if (next === "saved") timer.current = setTimeout(() => setState("idle"), 2000);
  }, []);
  return [state, mark];
}

export default function SaveStatus({ state, className = "" }: { state: SaveState; className?: string }) {
  if (state === "idle") return null;
  return (
    <span
      className={`${styles.status} ${className}`}
      data-state={state}
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {state === "saving" && <LoaderCircle className={styles.spin} aria-hidden="true" />}
      {state === "saved" && <Check aria-hidden="true" />}
      {state === "error" && <CircleAlert aria-hidden="true" />}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Not saved — retrying"}
    </span>
  );
}
