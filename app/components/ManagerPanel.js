"use client";

import { useEffect, useState } from "react";
import {
  DEPARTMENTS,
  flagName,
  RETORQUE_TIRES,
  retorqueTiresDisplay,
  HOLD_REASONS,
  inspMilesDisplay,
  entryHasContent,
} from "../lib/grid";
import { sanitizeBus } from "../lib/buses";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";

const EMPTY = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [] };
const DETAIL_FLAGS = new Set(["retorque", "hold", "inspection"]);
const REQUIRE_DETAIL = new Set(["retorque"]); // can't add without picking a detail (hold's reason is optional)
// A shared flag's "home" department (the first one it's listed in) — used so the
// By bus view shows each flag once even when it's in two departments.
const PRIMARY_DEPT = {};
DEPARTMENTS.forEach((d) => d.flags.forEach((f) => (f in PRIMARY_DEPT ? null : (PRIMARY_DEPT[f] = d.id))));

// Short text summary of a bus's flags for the list rows.
function entrySummary(entry) {
  if (!entry) return "";
  const parts = (entry.flags || []).map((id) => {
    if (id === "retorque") return `Retorque (${retorqueTiresDisplay(entry.retorqueTires)})`;
    if (id === "hold") return `Hold (${entry.holdReason})`;
    if (id === "inspection") {
      const m = inspMilesDisplay(entry);
      return m ? `Inspection (${m})` : "Inspection";
    }
    return flagName(id);
  });
  if (entry.note && entry.note.trim()) parts.push("Note");
  return parts.join(", ");
}

// ---- detail pickers ----
function MilesInput({ value, onSave }) {
  const has = value !== null && value !== undefined && value !== "";
  const [sign, setSign] = useState(has && Number(value) < 0 ? -1 : 1);
  const [mag, setMag] = useState(has ? String(Math.abs(Number(value))) : "");
  function commit(ns, nm) {
    const m = String(nm).replace(/\D/g, "");
    onSave(m === "" ? null : ns * parseInt(m, 10));
  }
  return (
    <div className="detailbox">
      <span className="detailbox__label">Miles</span>
      <button
        type="button"
        className="btn btn--mini"
        onClick={() => {
          const ns = sign === 1 ? -1 : 1;
          setSign(ns);
          commit(ns, mag);
        }}
        aria-label="Toggle miles to-go or overdue"
      >
        {sign < 0 ? "−" : "+"}
      </button>
      <input
        className="detailbox__num"
        inputMode="numeric"
        placeholder="0"
        value={mag}
        onChange={(e) => setMag(e.target.value.replace(/\D/g, ""))}
        onBlur={() => commit(sign, mag)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="detailbox__hint">{sign < 0 ? "overdue" : "to go"}</span>
    </div>
  );
}

function NoteInput({ value, onSave }) {
  const [v, setV] = useState(value || "");
  return (
    <input
      className="detailbox__text"
      placeholder="Type a note…"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value || "") && onSave(v)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function TirePicker({ tires, onChange }) {
  const set = new Set(tires || []);
  function toggle(id) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(RETORQUE_TIRES.filter((t) => next.has(t.id)).map((t) => t.id));
  }
  const summary = retorqueTiresDisplay(tires);
  return (
    <div className="detailbox detailbox--col">
      <div className="detailbox__label">Which tires?</div>
      <div className="tirepick">
        <div className="tirepick__hint">▲ front of bus</div>
        {RETORQUE_TIRES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tirebtn ${set.has(t.id) ? "tirebtn--on" : ""}`}
            onClick={() => toggle(t.id)}
          >
            {set.has(t.id) ? "✓ " : ""}
            {t.label}
          </button>
        ))}
        <div className="tirepick__hint">▼ rear of bus</div>
      </div>
      {summary ? (
        <div className="detailbox__sum">
          Shows as <strong>{summary}</strong>
        </div>
      ) : (
        <div className="detailbox__warn">Pick at least one tire</div>
      )}
    </div>
  );
}

function HoldReasonPicker({ reason, onChange }) {
  const [text, setText] = useState(reason || "");
  return (
    <div className="detailbox detailbox--col">
      <div className="detailbox__label">Hold reason (optional)</div>
      <div className="reasonpick">
        {HOLD_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            className={`deptchip ${reason === r ? "deptchip--on--maintenance" : ""}`}
            onClick={() => {
              setText(r);
              onChange(r);
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        className="detailbox__text"
        placeholder="Other reason…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (reason || "") && onChange(text)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

// ---- the grouped editor for one bus ----
function BusFlagEditor({ entry, onChange }) {
  // openDept: detail-flag id -> the department its picker opens under (present =
  // picker shown). A pre-existing on-flag falls back to its primary department.
  const [openDept, setOpenDept] = useState({});
  const isActive = (id) =>
    id === "retorque" ? (entry.retorqueTires || []).length > 0 : entry.flags.includes(id);
  const pickerShown = (id) => isActive(id) || id in openDept;
  const pickerDept = (id) => openDept[id] || PRIMARY_DEPT[id];
  const setOpen = (id, dept) => setOpenDept((m) => ({ ...m, [id]: dept }));
  const close = (id) =>
    setOpenDept((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });

  function toggle(id, dept) {
    if (id === "retorque") {
      if (isActive("retorque")) {
        onChange({ ...entry, flags: entry.flags.filter((f) => f !== "retorque"), retorqueTires: [] });
        close("retorque");
      } else if ("retorque" in openDept) {
        close("retorque"); // opened but no tire picked yet — just close it
      } else {
        setOpen("retorque", dept); // the flag is added once a tire is picked
      }
      return;
    }
    const on = entry.flags.includes(id);
    const flags = on ? entry.flags.filter((f) => f !== id) : [...entry.flags, id];
    const patch = { ...entry, flags };
    if (id === "inspection" && on) patch.inspMiles = null;
    if (id === "hold" && on) patch.holdReason = "";
    onChange(patch);
    if (DETAIL_FLAGS.has(id)) (on ? close : setOpen)(id, dept);
  }
  function setTires(tires) {
    const flags = tires.length
      ? entry.flags.includes("retorque")
        ? entry.flags
        : [...entry.flags, "retorque"]
      : entry.flags.filter((f) => f !== "retorque");
    onChange({ ...entry, flags, retorqueTires: tires });
    if (!tires.length) close("retorque");
  }
  function setReason(reason) {
    onChange({ ...entry, holdReason: reason });
  }

  function chipLabel(id) {
    if (id === "retorque" && isActive("retorque")) return `Retorque · ${retorqueTiresDisplay(entry.retorqueTires)}`;
    if (id === "hold" && isActive("hold") && (entry.holdReason || "").trim()) return `Hold · ${entry.holdReason}`;
    if (id === "inspection" && isActive("inspection")) {
      const m = inspMilesDisplay(entry);
      return m ? `Inspection · ${m}` : "Inspection";
    }
    return flagName(id);
  }

  return (
    <div className="busedit">
      {DEPARTMENTS.map((dept) => {
        return (
          <div className="busedit__dept" key={dept.id}>
            <div className={`busedit__depthead busedit__depthead--${dept.id}`}>
              <span className="busedit__dot" />
              {dept.label}
            </div>
            <div className="busedit__chips">
              {dept.flags.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`deptchip ${isActive(id) || id in openDept ? `deptchip--on--${dept.id}` : ""}`}
                  onClick={() => toggle(id, dept.id)}
                >
                  {isActive(id) ? "✓ " : ""}
                  {chipLabel(id)}
                </button>
              ))}
            </div>
            {dept.flags
              .filter((id) => DETAIL_FLAGS.has(id) && pickerShown(id) && pickerDept(id) === dept.id)
              .map((id) => (
                <div key={`${id}-detail`}>
                  {id === "retorque" && <TirePicker tires={entry.retorqueTires || []} onChange={setTires} />}
                  {id === "hold" && <HoldReasonPicker reason={entry.holdReason || ""} onChange={setReason} />}
                  {id === "inspection" && (
                    <MilesInput value={entry.inspMiles} onSave={(m) => onChange({ ...entry, inspMiles: m })} />
                  )}
                </div>
              ))}
          </div>
        );
      })}
      <div className="busedit__noterow">
        <span className="detailbox__label">Other note</span>
        <NoteInput value={entry.note} onSave={(n) => onChange({ ...entry, note: n })} />
      </div>
    </div>
  );
}

export default function ManagerPanel({ flags, onClose, onBusFlagsUpdated }) {
  const { numbers, isKnown, label } = useBusMaster();
  const [tab, setTab] = useState("bus");
  const [query, setQuery] = useState("");
  const [openBus, setOpenBus] = useState(null);
  const [dept, setDept] = useState(DEPARTMENTS[0].id);
  const [pickedFlag, setPickedFlag] = useState(DEPARTMENTS[0].flags[0]);
  const [busInput, setBusInput] = useState("");
  const [pending, setPending] = useState([]); // by-flag: buses awaiting a tire/reason

  // Typing a full bus number on the By bus tab opens its flag menu automatically.
  useEffect(() => {
    const t = query.trim();
    if (t && isKnown(t)) setOpenBus(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const getEntry = (bus) => flags[bus] || { ...EMPTY };
  function save(bus, entry) {
    fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bus,
        flags: entry.flags,
        note: entry.note,
        inspMiles: entry.inspMiles ?? null,
        holdReason: entry.holdReason ?? "",
        retorqueTires: entry.retorqueTires || [],
      }),
    }).catch(() => {});
    onBusFlagsUpdated(bus, entry);
  }

  // By bus: the list to show — matches when searching, else flagged buses.
  const q = query.trim();
  const busList = q
    ? numbers.filter((n) => n.includes(q)).slice(0, 60)
    : Object.keys(flags).filter((b) => entryHasContent(flags[b])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // By flag: buses carrying the picked flag.
  const deptObj = DEPARTMENTS.find((d) => d.id === dept) || DEPARTMENTS[0];
  const flagBuses = Object.keys(flags)
    .filter((b) => (flags[b].flags || []).includes(pickedFlag))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function addBusToFlag(busArg) {
    const bus = sanitizeBus(busArg != null ? busArg : busInput);
    if (bus.length < 4) return;
    setBusInput("");
    if (REQUIRE_DETAIL.has(pickedFlag)) {
      // Detail flags: add the bus to a pending list shown with its picker; it
      // only saves once a tire/reason is chosen.
      if (!flagBuses.includes(bus) && !pending.includes(bus)) setPending((p) => [...p, bus]);
      return;
    }
    const cur = getEntry(bus);
    if (!cur.flags.includes(pickedFlag)) save(bus, { ...cur, flags: [...cur.flags, pickedFlag] });
  }
  function removeFromFlag(bus) {
    const cur = getEntry(bus);
    const patch = { ...cur, flags: cur.flags.filter((f) => f !== pickedFlag) };
    if (pickedFlag === "inspection") patch.inspMiles = null;
    if (pickedFlag === "retorque") patch.retorqueTires = [];
    if (pickedFlag === "hold") patch.holdReason = "";
    save(bus, patch);
    setPending((p) => p.filter((b) => b !== bus));
  }
  function setTiresFor(bus, tires) {
    const cur = getEntry(bus);
    const flags2 = tires.length
      ? cur.flags.includes("retorque")
        ? cur.flags
        : [...cur.flags, "retorque"]
      : cur.flags.filter((f) => f !== "retorque");
    save(bus, { ...cur, flags: flags2, retorqueTires: tires });
    if (tires.length) setPending((p) => p.filter((b) => b !== bus));
  }
  function setReasonFor(bus, reason) {
    save(bus, { ...getEntry(bus), holdReason: reason });
  }
  const isPending = (bus) => pending.includes(bus) && !flagBuses.includes(bus);
  const flagRows = REQUIRE_DETAIL.has(pickedFlag)
    ? [...pending.filter((b) => !flagBuses.includes(b)), ...flagBuses]
    : flagBuses;

  return (
    <div className="manager no-print">
      <div className="manager__inner">
        <div className="manager__bar">
          <div className="manager__title">Edit flags</div>
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
              value={query}
              inputMode="numeric"
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="manager__list">
              {busList.length === 0 && (
                <div className="lotlist__empty">
                  {q ? "No buses match." : "No flagged buses yet — search a bus number to flag it."}
                </div>
              )}
              {busList.map((bus) => {
                const entry = getEntry(bus);
                const open = openBus === bus;
                const sum = entrySummary(entry);
                return (
                  <div className={`busblock ${open ? "busblock--open" : ""}`} key={bus}>
                    <button className="busblock__head" onClick={() => setOpenBus(open ? null : bus)}>
                      <span className="busblock__num">{label(bus)}</span>
                      <span className="busblock__type">
                        <TypeCodes num={bus} />
                      </span>
                      <span className="busblock__sum">{sum || "No flags"}</span>
                      <span className="busblock__chev">{open ? "▾" : "▸"}</span>
                    </button>
                    {open && <BusFlagEditor key={bus} entry={entry} onChange={(e) => save(bus, e)} />}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "flag" && (
          <div className="byflag">
            <div className="depttabs">
              {DEPARTMENTS.map((d) => (
                <button
                  key={d.id}
                  className={`depttab depttab--${d.id} ${dept === d.id ? "depttab--on" : ""}`}
                  onClick={() => {
                    setDept(d.id);
                    setPickedFlag(d.flags[0]);
                    setPending([]);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="flagpicker">
              {deptObj.flags.map((id) => (
                <button
                  key={id}
                  className={`deptchip ${pickedFlag === id ? `deptchip--on--${dept}` : ""}`}
                  onClick={() => {
                    setPickedFlag(id);
                    setPending([]);
                  }}
                >
                  {flagName(id)}
                </button>
              ))}
            </div>

            <div className="byflag__add">
              <input
                className="manager__search byflag__input"
                placeholder="Type a bus number to add…"
                value={busInput}
                inputMode="numeric"
                onChange={(e) => {
                  const v = sanitizeBus(e.target.value);
                  if (isKnown(v)) addBusToFlag(v);
                  else setBusInput(v);
                }}
                onKeyDown={(e) => e.key === "Enter" && addBusToFlag()}
              />
              <button className="btn btn--primary" onClick={() => addBusToFlag()}>
                Add
              </button>
            </div>
            {REQUIRE_DETAIL.has(pickedFlag) && (
              <div className="byflag__hint">
                Add a bus, then pick its {pickedFlag === "retorque" ? "tire(s)" : "reason"} below — it won't save until you
                do.
              </div>
            )}

            <div className="byflag__bar">
              <span className="byflag__count">
                {flagBuses.length} bus{flagBuses.length === 1 ? "" : "es"} flagged {flagName(pickedFlag)}
              </span>
            </div>

            <div className="manager__list">
              {flagRows.map((bus) => {
                const entry = getEntry(bus);
                return (
                  <div className="flagrow" key={bus}>
                    <div className="flagrow__head">
                      <span className="busblock__num">{label(bus)}</span>
                      <span className="busblock__type">
                        <TypeCodes num={bus} />
                      </span>
                      <div className="toolbar__spacer" />
                      <button className="busrow__clear" onClick={() => removeFromFlag(bus)}>
                        {isPending(bus) ? "Cancel" : "Remove"}
                      </button>
                    </div>
                    {pickedFlag === "retorque" && (
                      <TirePicker key={bus} tires={entry.retorqueTires || []} onChange={(t) => setTiresFor(bus, t)} />
                    )}
                    {pickedFlag === "hold" && (
                      <HoldReasonPicker key={bus} reason={entry.holdReason || ""} onChange={(r) => setReasonFor(bus, r)} />
                    )}
                    {pickedFlag === "inspection" && (
                      <MilesInput key={bus} value={entry.inspMiles} onSave={(m) => save(bus, { ...getEntry(bus), inspMiles: m })} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
