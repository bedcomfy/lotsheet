"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { MoreHorizontal, ChevronDown } from "lucide-react";

interface ToolMenuProps {
  label?: string;
  children: ReactNode;
}

// A compact "More ▾" toolbar dropdown for the less-used actions, so the
// toolbars stay uncluttered. The panel is PORTALED to <body> and positioned
// fixed (measured from the button) — iOS Safari clips fixed elements that live
// inside a momentum-scrolling container like the swipeable toolbar, so it must
// not render inside it. Clicking an action closes the menu; toggle rows
// stopPropagation to stay open.
export default function ToolMenu({ label = "More", children }: ToolMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return; // the panel lives in a portal
      setOpen(false);
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
      const panelWidth = 224;
      const sidebarEdge = window.matchMedia("(min-width: 900px)").matches ? 248 : 8;
      const left = Math.min(
        window.innerWidth - panelWidth - 8,
        Math.max(sidebarEdge + 8, r.left)
      );
      setPos({ top: r.bottom + 6, left });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="toolmenu" ref={ref}>
      <button ref={btnRef} className="btn" onClick={toggle} aria-expanded={open} aria-haspopup="menu">
        <MoreHorizontal size={16} /> {label} <ChevronDown size={14} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="toolmenu__panel"
            style={{ top: pos.top, left: pos.left }}
            role="menu"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}
