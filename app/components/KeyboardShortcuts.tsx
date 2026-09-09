"use client";

// Desktop keyboard shortcuts. "g" then a letter jumps between pages (g l = Lot
// Sheet, g t = Turnover, …); "?" lists them. "/" and Ctrl/Cmd+K focus the
// fleet search (handled by GlobalBusSearch). Nothing fires while typing in a
// field, so the sheets' inputs are never hijacked.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveDialog } from "../ui";
import styles from "./KeyboardShortcuts.module.css";

const GO: Array<{ key: string; label: string; path: string }> = [
  { key: "h", label: "Home", path: "/home" },
  { key: "l", label: "Lot Sheet", path: "/" },
  { key: "t", label: "Turnover Sheet", path: "/turnover" },
  { key: "s", label: "Service Sheets", path: "/service" },
  { key: "o", label: "Shop", path: "/shop" },
  { key: "f", label: "Fleet", path: "/buses" },
  { key: "w", label: "Work Order", path: "/workorder" },
];

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let pendingGo = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (event.key === "g") {
        pendingGo = Date.now();
        return;
      }
      if (pendingGo && Date.now() - pendingGo < 1200) {
        const target = GO.find((item) => item.key === event.key.toLowerCase());
        pendingGo = 0;
        if (target) {
          event.preventDefault();
          router.push(target.path);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <ResponsiveDialog
      isOpen={helpOpen}
      onOpenChange={setHelpOpen}
      title="Keyboard shortcuts"
      description="Desktop only. Press ? to close."
      size="sm"
    >
      <dl className={styles.list}>
        <dt><kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd></dt>
        <dd>Search the fleet by bus number</dd>
        {GO.map((item) => (
          <div key={item.key} className={styles.row}>
            <dt><kbd>g</kbd> then <kbd>{item.key}</kbd></dt>
            <dd>{item.label}</dd>
          </div>
        ))}
        <dt><kbd>?</kbd></dt>
        <dd>This list</dd>
      </dl>
    </ResponsiveDialog>
  );
}
