"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { OBJECT_CODES } from "../lib/objectCodes";

interface ObjectCodePickerProps {
  value: string[];
  onChange: (codes: string[]) => void;
}

function descFor(code: string): string {
  return OBJECT_CODES.find((c) => c.code === code)?.description || "";
}

// A searchable multi-select for object codes. Selected codes show as removable
// chips; the search box opens a dropdown of matching codes (by code number or
// description) so admins don't have to remember or type them exactly.
export default function ObjectCodePicker({ value, onChange }: ObjectCodePickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = new Set(value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? OBJECT_CODES.filter((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      : OBJECT_CODES;
    return list.slice(0, 80);
  }, [query]);

  function toggle(code: string) {
    if (selected.has(code)) onChange(value.filter((c) => c !== code));
    else onChange([...value, code]);
  }

  return (
    <div className="ocpick" ref={wrapRef}>
      {value.length > 0 && (
        <div className="ocpick__chips">
          {value.map((code) => (
            <span className="ocpick__chip" key={code}>
              <strong>{descFor(code) || code}</strong>
              {descFor(code) && <small>Object code {code}</small>}
              <button type="button" onClick={() => toggle(code)} aria-label={`Remove ${code}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="ocpick__searchwrap">
        <Search size={15} />
        <input
          className="ocpick__search"
          placeholder="Search object codes to add…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </div>

      {open && (
        <div className="ocpick__menu" role="listbox">
          {matches.length === 0 && <div className="ocpick__empty">No matching object codes.</div>}
          {matches.map((c) => {
            const on = selected.has(c.code);
            return (
              <button
                type="button"
                key={c.code}
                className={`ocpick__opt ${on ? "ocpick__opt--on" : ""}`}
                onClick={() => toggle(c.code)}
                role="option"
                aria-selected={on}
              >
                <span className="ocpick__check">{on && <Check size={14} />}</span>
                <span className="ocpick__code">{c.code}</span>
                <span className="ocpick__desc">{c.description}</span>
              </button>
            );
          })}
          {query.trim() === "" && OBJECT_CODES.length > matches.length && (
            <div className="ocpick__more">Showing {matches.length} of {OBJECT_CODES.length} — type to search.</div>
          )}
        </div>
      )}
    </div>
  );
}
