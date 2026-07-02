"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal, ChevronDown } from "lucide-react";

interface ToolMenuProps {
  label?: string;
  children: ReactNode;
}

// A compact "More ▾" toolbar dropdown for the less-used actions, so the
// toolbars stay uncluttered. The panel is position:fixed (measured from the
// button) so the phone's horizontally-scrolling toolbar can't clip it.
// Clicking an action closes the menu; toggle rows stopPropagation to stay open.
export default function ToolMenu({ label = "More", children }: ToolMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="toolmenu" ref={ref}>
      <button ref={btnRef} className="btn" onClick={toggle} aria-expanded={open} aria-haspopup="menu">
        <MoreHorizontal size={16} /> {label} <ChevronDown size={14} />
      </button>
      {open && pos && (
        <div
          className="toolmenu__panel"
          style={{ top: pos.top, right: pos.right }}
          role="menu"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
