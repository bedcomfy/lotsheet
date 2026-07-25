"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HTMLAttributes, KeyboardEvent } from "react";
import type { Employee } from "../lib/types";
import { employeeFullName } from "../lib/types";
import styles from "./EmployeeInput.module.css";

interface Rect {
  left: number;
  top: number;
  width: number;
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

  function measure() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom, width: r.width });
  }
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
            style={{ position: "fixed", left: rect.left, top: rect.top, minWidth: rect.width }}
          >
            {matches.map((e, i) => (
              <li
                key={`${e.firstName}|${e.lastName}|${e.badge}|${i}`}
                className={styles.item}
                role="option"
                aria-selected={i === hi}
                data-highlighted={i === hi || undefined}
                onMouseDown={(ev) => {
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
