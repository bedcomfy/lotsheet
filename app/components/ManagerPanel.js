"use client";

import { useMemo, useState } from "react";
import { ASSIGNABLE_FLAGS, flagLabel } from "../lib/grid";
import { BUS_NUMBERS, sanitizeBus, isKnownBus, busLabel } from "../lib/buses";
import TypeCodes from "./TypeCodes";

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

// Inspection mileage input. A +/− toggle button sets the sign (mobile number
// pads have no minus key) and the field holds the magnitude. Positive = miles
// to go, negative = miles overdue. Saves on toggle, blur, or Enter.
function MilesInput({ value, onSave }) {
  const has = value !== null && value !== undefined && value !== "";
  const [sign, setSign] = useState(has && Number(value) < 0 ? -1 : 1);
  const [mag, setMag] = useState(has ? String(Math.abs(Number(value))) : "");

  function commit(nextSign, nextMag) {
    const m = String(nextMag).replace(/\D/g, "");
    const out = m === "" ? null : nextSign * parseInt(m, 10);
    const cur = has ? Number(value) : null;
    if (out !== cur) onSave(out);
  }
  function toggleSign() {
    const ns = sign === 1 ? -1 : 1;
    setSign(ns);
    commit(ns, mag);
  }
  return (
    <div className="milesinput">
      <span className="milesinput__label">Insp miles</span>
      <button
        type="button"
        className="milesinput__sign"
        onClick={toggleSign}
        aria-label="Toggle miles to-go (+) or overdue (−)"
      >
        {sign < 0 ? "−" : "+"}
      </button>
      <input
        className="milesinput__field"
        inputMode="numeric"
        placeholder="0"
        value={mag}
        onChange={(e) => setMag(e.target.value.replace(/\D/g, ""))}
        onBlur={() => commit(sign, mag)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

const OTHER = { id: "other", label: "OTHER" };

export default function ManagerPanel({ flags, onClose, onBusFlagsUpdated }) {
  const [tab, setTab] = useState("bus");
  const [filter, setFilter] = useState("");
  const [savingBus, setSavingBus] = useState(null);

  const [selectedFlag, setSelectedFlag] = useState(ASSIGNABLE_FLAGS[0].id);
  const [busInput, setBusInput] = useState("");

  const getEntry = (bus) => flags[bus] || { flags: [], note: "", inspMiles: null };

  async function postEntry(bus, entry) {
    const res = await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bus,
        flags: entry.flags,
        note: entry.note,
        inspMiles: entry.inspMiles ?? null,
      }),
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
    const adding = !cur.flags.includes(flagId);
    const flags2 = adding ? [...cur.flags, flagId] : cur.flags.filter((f) => f !== flagId);
    // Clear stored miles when inspection is removed.
    const inspMiles = flags2.includes("inspection") ? cur.inspMiles ?? null : null;
    save(bus, { ...cur, flags: flags2, inspMiles });
  }
  function setNote(bus, note) {
    save(bus, { ...getEntry(bus), note });
  }
  function setMiles(bus, miles) {
    save(bus, { ...getEntry(bus), inspMiles: miles });
  }
  function clearBus(bus) {
    save(bus, { flags: [], note: "", inspMiles: null });
  }

  const isOther = selectedFlag === "other";

  function addBusToFlag(busArg) {
    if (isOther) return;
    const bus = sanitizeBus(busArg != null ? busArg : busInput);
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
    else {
      const flags2 = cur.flags.filter((f) => f !== selectedFlag);
      const inspMiles = flags2.includes("inspection") ? cur.inspMiles ?? null : null;
      save(bus, { ...cur, flags: flags2, inspMiles });
    }
  }
  async function clearAllForFlag() {
    const label = isOther ? "all custom notes" : flagLabel(selectedFlag);
    if (!matchedBuses.length) return;
    if (!window.confirm(`Remove ${label} from all ${matchedBuses.length} bus(es)?`)) return;
    await Promise.all(
      matchedBuses.map((bus) => {
        const cur = getEntry(bus);
        let entry;
        if (isOther) entry = { ...cur, note: "" };
        else {
          const flags2 = cur.flags.filter((f) => f !== selectedFlag);
          const inspMiles = flags2.includes("inspection") ? cur.inspMiles ?? null : null;
          entry = { ...cur, flags: flags2, inspMiles };
        }
        return postEntry(bus, entry);
      })
    );
  }

  const buses = useMemo(() => {
    const f = filter.trim().toUpperCase();
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

  const pickerFlags = [...ASSIGNABLE_FLAGS, OTHER];

  return (
    <div className="manager no-print">
      <div className="manager__inner">
        <div className="manager__bar">
          <div className="manager__title">Edit Flags</div>
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
                      <div className="busrow__num">{busLabel(bus)}</div>
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
                    {set.has("inspection") && (
                      <MilesInput
                        key={`miles-${bus}`}
                        value={entry.inspMiles}
                        onSave={(m) => setMiles(bus, m)}
                      />
                    )}
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
                  onChange={(e) => {
                    const v = sanitizeBus(e.target.value);
                    // Autofill: add as soon as a valid bus number is typed.
                    if (isKnownBus(v)) addBusToFlag(v);
                    else setBusInput(v);
                  }}
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
                  <div className="busrow__num">{busLabel(bus)}</div>
                  <span className="busrow__type">
                    <TypeCodes num={bus} />
                  </span>
                  {isOther && <span className="busitem__note">{getEntry(bus).note}</span>}
                  {selectedFlag === "inspection" && (
                    <MilesInput
                      key={`fmiles-${bus}`}
                      value={getEntry(bus).inspMiles}
                      onSave={(m) => setMiles(bus, m)}
                    />
                  )}
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
