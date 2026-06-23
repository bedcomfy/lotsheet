"use client";

import { useMemo, useState } from "react";
import { ASSIGNABLE_FLAGS, flagLabel } from "../lib/grid";
import { BUS_NUMBERS } from "../lib/buses";
import TypeCodes from "./TypeCodes";

function sanitizeBus(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d && d[0] !== "2" && d[0] !== "6") d = "";
  return d.slice(0, 5);
}

// Free-text custom-note input with local state; saves on blur / Enter.
function NoteInput({ value, onSave }) {
  const [v, setV] = useState(value || "");
  return (
    <input
      className="busrow__note"
      placeholder="Other issue — type to add…"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== (value || "")) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

const OTHER = { id: "other", label: "OTHER" };

export default function ManagerPanel({ flags, onClose, onBusFlagsUpdated }) {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const [tab, setTab] = useState("bus");
  const [filter, setFilter] = useState("");
  const [savingBus, setSavingBus] = useState(null);

  const [selectedFlag, setSelectedFlag] = useState(ASSIGNABLE_FLAGS[0].id);
  const [busInput, setBusInput] = useState("");

  const getEntry = (bus) => flags[bus] || { flags: [], note: "" };

  async function unlock() {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) setAuthed(pw);
      else setError("Incorrect manager password.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setChecking(false);
    }
  }

  async function postEntry(bus, entry) {
    const res = await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: authed, bus, flags: entry.flags, note: entry.note }),
    });
    if (res.ok) onBusFlagsUpdated(bus, entry);
  }
  async function save(bus, entry) {
    setSavingBus(bus);
    try {
      await postEntry(bus, entry);
    } finally {
      setSavingBus(null);
    }
  }

  function toggle(bus, flagId) {
    const cur = getEntry(bus);
    const flags2 = cur.flags.includes(flagId)
      ? cur.flags.filter((f) => f !== flagId)
      : [...cur.flags, flagId];
    save(bus, { ...cur, flags: flags2 });
  }
  function setNote(bus, note) {
    save(bus, { ...getEntry(bus), note });
  }
  function clearBus(bus) {
    save(bus, { flags: [], note: "" });
  }

  const isOther = selectedFlag === "other";

  function addBusToFlag() {
    if (isOther) return;
    const bus = sanitizeBus(busInput);
    if (bus.length < 4) return;
    const cur = getEntry(bus);
    if (!cur.flags.includes(selectedFlag)) {
      save(bus, { ...cur, flags: [...cur.flags, selectedFlag] });
    }
    setBusInput("");
  }
  function removeFromFlag(bus) {
    const cur = getEntry(bus);
    if (isOther) save(bus, { ...cur, note: "" });
    else save(bus, { ...cur, flags: cur.flags.filter((f) => f !== selectedFlag) });
  }
  async function clearAllForFlag() {
    const label = isOther ? "all custom notes" : flagLabel(selectedFlag);
    if (!matchedBuses.length) return;
    if (!window.confirm(`Remove ${label} from all ${matchedBuses.length} bus(es)?`)) return;
    await Promise.all(
      matchedBuses.map((bus) => {
        const cur = getEntry(bus);
        const entry = isOther
          ? { ...cur, note: "" }
          : { ...cur, flags: cur.flags.filter((f) => f !== selectedFlag) };
        return postEntry(bus, entry);
      })
    );
  }

  const buses = useMemo(() => {
    const f = filter.trim();
    return f ? BUS_NUMBERS.filter((b) => b.includes(f)) : BUS_NUMBERS;
  }, [filter]);

  const matchedBuses = useMemo(
    () =>
      Object.keys(flags)
        .filter((b) => {
          const e = flags[b];
          return isOther ? e.note && e.note.trim() : (e.flags || []).includes(selectedFlag);
        })
        .sort(),
    [flags, selectedFlag, isOther]
  );

  // ----- Login -----
  if (!authed) {
    return (
      <div className="modal-backdrop no-print" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal__head">
            <div className="modal__title">Manager sign-in</div>
            <button className="modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <label className="modal__label">Manager password</label>
          <input
            className="modal__input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            autoFocus
          />
          {error && <div className="modal__warn">{error}</div>}
          <div className="modal__actions">
            <div className="toolbar__spacer" />
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn--primary" onClick={unlock} disabled={checking}>
              {checking ? "Checking…" : "Unlock"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pickerFlags = [...ASSIGNABLE_FLAGS, OTHER];

  // ----- Manager -----
  return (
    <div className="manager no-print">
      <div className="manager__inner">
        <div className="manager__bar">
          <div className="manager__title">Manager · Bus flags</div>
          <div className="toolbar__spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === "bus" ? "tab--on" : ""}`} onClick={() => setTab("bus")}>
            By bus
          </button>
          <button className={`tab ${tab === "flag" ? "tab--on" : ""}`} onClick={() => setTab("flag")}>
            By flag
          </button>
        </div>

        {tab === "bus" && (
          <>
            <input
              className="manager__search"
              placeholder="Search bus number…"
              value={filter}
              inputMode="numeric"
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="manager__list">
              {buses.map((bus) => {
                const entry = getEntry(bus);
                const set = new Set(entry.flags);
                const hasContent = set.size > 0 || (entry.note && entry.note.trim());
                return (
                  <div className="busrow" key={bus}>
                    <div className="busrow__head">
                      <div className="busrow__num">{bus}</div>
                      <span className="busrow__type">
                        <TypeCodes num={bus} />
                      </span>
                      <div className="toolbar__spacer" />
                      {hasContent && (
                        <button className="busrow__clear" onClick={() => clearBus(bus)}>
                          Clear
                        </button>
                      )}
                      {savingBus === bus && <span className="busrow__saving">saving…</span>}
                    </div>
                    <div className="busrow__flags">
                      {ASSIGNABLE_FLAGS.map((f) => (
                        <button
                          key={f.id}
                          className={`fchip ${set.has(f.id) ? "fchip--on" : ""}`}
                          onClick={() => toggle(bus, f.id)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <NoteInput
                      key={`note-${bus}`}
                      value={entry.note}
                      onSave={(text) => setNote(bus, text)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "flag" && (
          <div className="byflag">
            <div className="flagpicker">
              {pickerFlags.map((f) => (
                <button
                  key={f.id}
                  className={`fchip ${selectedFlag === f.id ? "fchip--on" : ""}`}
                  onClick={() => setSelectedFlag(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {!isOther && (
              <div className="byflag__add">
                <input
                  className="manager__search byflag__input"
                  placeholder="Type a bus number to add…"
                  value={busInput}
                  inputMode="numeric"
                  onChange={(e) => setBusInput(sanitizeBus(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && addBusToFlag()}
                />
                <button className="btn btn--primary" onClick={addBusToFlag}>
                  Add
                </button>
              </div>
            )}

            <div className="byflag__bar">
              <span className="byflag__count">
                {matchedBuses.length} bus{matchedBuses.length === 1 ? "" : "es"}
                {isOther ? " with a note" : ` flagged ${flagLabel(selectedFlag)}`}
              </span>
              <div className="toolbar__spacer" />
              {matchedBuses.length > 0 && (
                <button className="busrow__clear" onClick={clearAllForFlag}>
                  Clear all
                </button>
              )}
            </div>

            <div className="manager__list">
              {matchedBuses.map((bus) => (
                <div className="busitem" key={bus}>
                  <div className="busrow__num">{bus}</div>
                  <span className="busrow__type">
                    <TypeCodes num={bus} />
                  </span>
                  {isOther && <span className="busitem__note">{getEntry(bus).note}</span>}
                  <div className="toolbar__spacer" />
                  <button className="busrow__clear" onClick={() => removeFromFlag(bus)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
