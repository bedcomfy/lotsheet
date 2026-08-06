"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HTMLAttributes, KeyboardEvent } from "react";
import type { Employee } from "../lib/types";
import { employeeFullName } from "../lib/types";
import { useOverlayPresence } from "../ui/useOverlayPresence";
import styles from "./EmployeeInput.module.css";

interface Rect {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

interface EmployeeInputProps {
  value: string;
  onChange: (v: string) => void;
  employees?: Employee[];
  className?: string;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}

// A text input that suggests from the employee list as you type (matching name
// OR badge). Tab / Enter / click fills the highlighted name. Free text is always
// allowed — not everyone (e.g. contractors) is in the list. The dropdown is
// position:fixed AND portaled to <body>: table cells clip via overflow:hidden,
// and iOS Safari clips fixed elements inside momentum-scrolling containers
// (the sheet's pan area), so it must render outside both.
export default function EmployeeInput({
  value,
  onChange,
  employees = [],
  className = "turnt__in",
  placeholder,
  inputMode,
}: EmployeeInputProps) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const q = (value || "").trim().toLowerCase();
  const matches: Employee[] = q
    ? employees
        .filter(
          (e) =>
            employeeFullName(e).toLowerCase().includes(q) ||
            (e.firstName && e.firstName.toLowerCase().includes(q)) ||
            (e.lastName && e.lastName.toLowerCase().includes(q)) ||
            (e.badge && e.badge.toLowerCase().includes(q))
        )
        .slice(0, 6)
    : [];
  const showingSuggestions = open && matches.length > 0 && rect !== null;
  useOverlayPresence(showingSuggestions);

  const measure = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const inset = 8;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const spaceBelow = Math.max(0, viewportBottom - r.bottom - inset);
    const spaceAbove = Math.max(0, r.top - viewportTop - inset);
    const above = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = above ? spaceAbove : spaceBelow;
    const maxWidth = Math.max(1, viewportWidth - inset * 2);
    const width = Math.min(Math.max(r.width, 240), maxWidth);
    const left = Math.min(
      Math.max(r.left, viewportLeft + inset),
      Math.max(viewportLeft + inset, viewportRight - width - inset),
    );
    setRect({
      left,
      top: above ? r.top - 4 : r.bottom + 4,
      width,
      maxHeight: Math.max(44, Math.min(288, available - 4)),
      above,
    });
  }, []);

  useEffect(() => {
    if (!showingSuggestions) return;
    const viewport = window.visualViewport;
    const update = () => measure();
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [measure, showingSuggestions]);

  function pick(emp: Employee) {
    onChange(employeeFullName(emp) || emp.badge);
    setOpen(false);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(matches.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      pick(matches[hi] || matches[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      <input
        ref={ref}
        className={className}
        value={value || ""}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          measure();
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => {
          measure();
          setOpen(true);
          setHi(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
      />
      {open &&
        matches.length > 0 &&
        rect &&
        createPortal(
          <ul
            className={styles.list}
            role="listbox"
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              maxHeight: rect.maxHeight,
              transform: rect.above ? "translateY(-100%)" : undefined,
            }}
          >
            {matches.map((e, i) => (
              <li
                key={`${e.firstName}|${e.lastName}|${e.badge}|${i}`}
                className={styles.item}
                role="option"
                aria-selected={i === hi}
                data-highlighted={i === hi || undefined}
                onPointerDown={(ev) => {
                  ev.preventDefault();
                  pick(e);
                }}
                onMouseEnter={() => setHi(i)}
              >
                <span className={styles.name}>{employeeFullName(e) || "(no name)"}</span>
                {e.badge && <span className={styles.badge}>#{e.badge}</span>}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}
