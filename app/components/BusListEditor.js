"use client";

import { useMemo, useState } from "react";
import { BUS_CATEGORIES, BUS_STATUSES } from "../lib/buses";
import { useScrollLock } from "../lib/useScrollLock";
import { useBusMaster } from "./BusMasterProvider";
import CsvEditor from "./CsvEditor";
import TypeCodes from "./TypeCodes";

const PASSWORD = "ride";

// Editing the bus master list is gated by a password (kept simple — it's a
// deterrent so everyday staff don't change the fleet by accident).
export default function BusListEditor({ onClose }) {
  useScrollLock();
  const [unlocked, setUnlocked] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem("pace:buslist") === "1"
  );
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);

  function tryUnlock() {
    if (pw.trim().toLowerCase() === PASSWORD) {
      setUnlocked(true);
      try {
        sessionStorage.setItem("pace:buslist", "1");
      } catch {}
    } else {
      setPwErr(true);
    }
  }

  if (!unlocked) {
    return (
      <div className="modal-backdrop no-print" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal__head">
            <div>
              <div className="modal__title">Bus Lists</div>
              <div className="modal__sub">Enter the password to edit the bus list.</div>
            </div>
            <button className="modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="pwgate">
            <input
              className="manager__search"
              type="password"
              placeholder="Password"
              autoFocus
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setPwErr(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            />
            <button className="btn btn--primary" onClick={tryUnlock}>
              Unlock
            </button>
          </div>
          {pwErr && <div className="pwgate__err">Wrong password.</div>}
        </div>
      </div>
    );
  }

  return <Editor onClose={onClose} />;
}

function Editor({ onClose }) {
  const { master, setMaster } = useBusMaster();
  const [buses, setBuses] = useState(() => master.buses.map((b) => ({ ...b })));
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const catLabel = useMemo(() => Object.fromEntries(BUS_CATEGORIES.map((c) => [c.id, c.label])), []);

  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase();
    if (!f) return buses;
    return buses.filter(
      (b) => b.num.includes(f) || (b.model || "").toUpperCase().includes(f) || (b.name || "").toUpperCase().includes(f)
    );
  }, [buses, filter]);

  function update(num, patch) {
    setBuses((list) => list.map((b) => (b.num === num ? { ...b, ...patch } : b)));
    setDirty(true);
  }
  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/buses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master: { buses } }),
      });
      const d = await res.json().catch(() => ({}));
      if (d && d.master) {
        setMaster(d.master);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  if (csvOpen) return <CsvEditor onClose={() => setCsvOpen(false)} onSaved={onClose} />;

  return (
    <div className="modal-backdrop no-print" onClick={onClose}>
      <div className="modal modal--tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <div className="modal__title">Bus Lists</div>
            <div className="modal__sub">
              Mark a bus Active/Retired and whether it's on the Fuel/DEF lane. For model, type, or length changes, use Edit full list.
            </div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="buslist__add">
          <input
            className="manager__search buslist__search"
            placeholder="Search a bus number…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="manager__list">
          {shown.length === 0 && <div className="lotlist__empty">No buses match.</div>}
          {shown.map((b) => (
            <div className={`buslist__row ${b.status === "retired" ? "buslist__row--retired" : ""}`} key={b.num}>
              <div className="buslist__num">{b.name ? `${b.name} (${b.num})` : b.num}</div>
              <span className="buslist__code">
                <TypeCodes num={b.num} />
              </span>
              <div className="buslist__info">
                {catLabel[b.type] || "Standard"}
                {b.model ? ` · ${b.model}` : ""}
              </div>
              <div className="toolbar__spacer" />
              <select className="buslist__sel" value={b.status || "active"} onChange={(e) => update(b.num, { status: e.target.value })}>
                {BUS_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <label className="buslist__lane" title="Included on the Fuel / DEF service-lane sheets">
                <input
                  type="checkbox"
                  checked={!!b.lane}
                  disabled={b.status === "retired"}
                  onChange={(e) => update(b.num, { lane: e.target.checked })}
                />{" "}
                Fuel/DEF
              </label>
            </div>
          ))}
        </div>

        <div className="modal__actions">
          <button className="btn" onClick={() => setCsvOpen(true)}>
            Edit full list (CSV)
          </button>
          <span className="buslist__hint">{dirty ? "Unsaved changes" : ""}</span>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
