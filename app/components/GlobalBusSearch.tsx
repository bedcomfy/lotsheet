"use client";

// The answer to "where is bus 6423?" from anywhere on the desktop site:
// press "/" (or Ctrl/Cmd+K), type the number, see its live location and flags,
// jump to it on the Lot Sheet or open its Bus Card. The sidebar's "Find bus"
// button opens the same panel via the pace:find-bus window event.
// Phones keep their own flow (the Buses tab) — this overlay is desktop chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, CornerDownLeft, Flag, Search, X } from "lucide-react";
import { useFlags, useLotSheet } from "../lib/queries";
import { fleetBusLocations } from "../lib/fleetStats";
import { flagName } from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import { pushRecent } from "./mapp/MBuses";

const RECENT_KEY = "pace:m:recent";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export default function GlobalBusSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: sheetData } = useLotSheet();
  const { data: flags = {} } = useFlags();
  const { numbers, isKnown, label } = useBusMaster();

  const show = useCallback(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"));
    } catch {}
    setQ("");
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show();
        return;
      }
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditable(event.target)) {
        event.preventDefault();
        show();
      }
    };
    const onFindEvent = () => show();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pace:find-bus", onFindEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pace:find-bus", onFindEvent);
    };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const locations = useMemo(
    () => fleetBusLocations(sheetData?.sheet || null, flags),
    [sheetData, flags]
  );

  const matches = useMemo(() => {
    if (!q) return recent.filter((b) => isKnown(b)).slice(0, 8);
    return numbers.filter((n) => n.startsWith(q)).slice(0, 8);
  }, [q, numbers, recent, isKnown]);

  const exact = q.length >= 4 && isKnown(q) ? q : null;
  const entry = exact ? flags[exact] : undefined;
  const flagIds = entry?.flags || [];
  const where = exact ? locations[exact] || [] : [];

  function jumpToLot(bus: string) {
    pushRecent(bus);
    setOpen(false);
    router.push(`/?find=${encodeURIComponent(bus)}`);
  }
  function openCard(bus: string) {
    pushRecent(bus);
    setOpen(false);
    router.push(`/buses?bus=${encodeURIComponent(bus)}`);
  }

  if (!open) return null;

  return (
    <div className="bfind no-print" role="dialog" aria-modal="true" aria-label="Find bus" onClick={() => setOpen(false)}>
      <div className="bfind__panel" onClick={(event) => event.stopPropagation()}>
        <label className="bfind__input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Bus number…"
            inputMode="numeric"
            aria-label="Bus number"
            onChange={(event) => setQ(sanitizeBus(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && exact) jumpToLot(exact);
            }}
          />
          <button type="button" className="bfind__close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </label>

        {exact ? (
          <div className="bfind__hit">
            <div className="bfind__bus">
              <strong>{label(exact)}</strong>
              <span>{where.length ? where.join(" · ") : "Not placed right now"}</span>
            </div>
            {(flagIds.length > 0 || entry?.note || entry?.holdReason) && (
              <div className="bfind__flags">
                {flagIds.map((id) => (
                  <span className="bfind__flag" key={id}><Flag size={12} /> {flagName(id)}</span>
                ))}
                {entry?.note && <span className="bfind__flag bfind__flag--dim">“{entry.note}”</span>}
                {entry?.holdReason && <span className="bfind__flag bfind__flag--dim">Hold: {entry.holdReason}</span>}
              </div>
            )}
            <div className="bfind__actions">
              <button type="button" className="btn btn--primary" onClick={() => jumpToLot(exact)}>
                <ClipboardList size={15} /> Show on Lot Sheet <kbd><CornerDownLeft size={11} /></kbd>
              </button>
              <button type="button" className="btn" onClick={() => openCard(exact)}>
                Bus card
              </button>
            </div>
          </div>
        ) : (
          <>
            {q.length >= 4 && (
              <p className="bfind__miss">&ldquo;{q}&rdquo; isn&rsquo;t a known bus number.</p>
            )}
            {matches.length > 0 && (
              <div className="bfind__matches">
                <span className="bfind__matchlabel">{q ? "Matches" : "Recent"}</span>
                <div className="bfind__chips">
                  {matches.map((bus) => (
                    <button
                      type="button"
                      key={bus}
                      className={`bfind__chip ${(flags[bus]?.flags || []).length ? "bfind__chip--flag" : ""}`}
                      onClick={() => setQ(bus)}
                    >
                      {bus}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="bfind__hint">
              Type a bus number — <kbd>Enter</kbd> shows it on the Lot Sheet. <kbd>Esc</kbd> closes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
