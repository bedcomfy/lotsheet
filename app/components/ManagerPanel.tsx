"use client";

import { useEffect, useState } from "react";
import {
  DEPARTMENTS,
  flagName,
  RETORQUE_TIRES,
  retorqueTiresDisplay,
  HOLD_REASONS,
  inspMilesDisplay,
  INSPECTION_OPTIONS,
  entryHasContent,
} from "../lib/grid";
import { X } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import Overlay from "./Overlay";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import type { FlagEntry, FlagMap } from "../lib/types";

const EMPTY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
const DETAIL_FLAGS = new Set(["retorque", "hold", "inspection"]);
// Pseudo-flag for the By flag tab: "Other" = buses with a free-text note.
const NOTE_FLAG = "__note";
const REQUIRE_DETAIL = new Set(["retorque", NOTE_FLAG]); // can't add without picking a detail (hold's reason is optional)
// A shared flag's "home" department (the first one it's listed in) — used so the
// By bus view shows each flag once even when it's in two departments.
const PRIMARY_DEPT: Record<string, string> = {};
DEPARTMENTS.forEach((d) => d.flags.forEach((f) => (f in PRIMARY_DEPT ? null : (PRIMARY_DEPT[f] = d.id))));

// Short text summary of a bus's flags for the list rows.
function entrySummary(entry: FlagEntry | null | undefined): string {
  if (!entry) return "";
  const parts = (entry.flags || []).map((id) => {
    if (id === "retorque") return `Retorque (${retorqueTiresDisplay(entry.retorqueTires)})`;
    if (id === "hold") return `Hold (${entry.holdReason})`;
    if (id === "inspection") {
      const o = (entry.inspOption || "").trim() || inspMilesDisplay(entry);
      return o ? `Inspection (${o})` : "Inspection";
    }
    return flagName(id);
  });
  // Show the note itself, not just the word "Note".
  const note = (entry.note || "").trim();
  if (note) parts.push(`“${note.length > 46 ? note.slice(0, 45) + "…" : note}”`);
  return parts.join(", ");
}

// ---- detail pickers ----
function MilesInput({ value, onSave }: { value: number | string | null; onSave: (v: number | null) => void }) {
  const has = value !== null && value !== undefined && value !== "";
  const [sign, setSign] = useState(has && Number(value) < 0 ? -1 : 1);
  const [mag, setMag] = useState(has ? String(Math.abs(Number(value))) : "");
  function commit(ns: number, nm: string) {
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

function NoteInput({ value, onSave }: { value: string | undefined; onSave: (v: string) => void }) {
  const [v, setV] = useState(value || "");
  return (
    <div className="noterow">
      <input
        className="detailbox__text"
        placeholder="Type a note…"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (value || "") && onSave(v)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {!!v && (
        <button
          type="button"
          className="noterow__clear"
          onClick={() => {
            setV("");
            onSave("");
          }}
          aria-label="Remove note"
          title="Remove the note"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function TirePicker({ tires, onChange }: { tires: string[] | undefined; onChange: (tires: string[]) => void }) {
  const set = new Set(tires || []);
  function toggle(id: string) {
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

function HoldReasonPicker({ reason, onChange }: { reason: string | undefined; onChange: (r: string) => void }) {
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

// Optional inspection type — pick one of A-3 … C-24 (or none).
function InspOptionPicker({ option, onChange }: { option: string | undefined; onChange: (o: string) => void }) {
  return (
    <div className="detailbox detailbox--col">
      <div className="detailbox__label">Inspection (optional)</div>
      <div className="reasonpick">
        {INSPECTION_OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            className={`deptchip ${option === o ? "deptchip--on--service" : ""}`}
            onClick={() => onChange(option === o ? "" : o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- the grouped editor for one bus ----
function BusFlagEditor({ entry, onChange }: { entry: FlagEntry; onChange: (e: FlagEntry) => void }) {
  // openDept: detail-flag id -> the department its picker opens under (present =
  // picker shown). A pre-existing on-flag falls back to its primary department.
  const [openDept, setOpenDept] = useState<Record<string, string>>({});
  const isActive = (id: string) =>
    id === "retorque" ? (entry.retorqueTires || []).length > 0 : entry.flags.includes(id);
  const pickerShown = (id: string) => isActive(id) || id in openDept;
  const pickerDept = (id: string) => openDept[id] || PRIMARY_DEPT[id];
  const setOpen = (id: string, dept: string) => setOpenDept((m) => ({ ...m, [id]: dept }));
  const close = (id: string, _dept?: string) =>
    setOpenDept((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });

  function toggle(id: string, dept: string) {
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
    const patch: FlagEntry = { ...entry, flags };
    if (id === "inspection" && on) patch.inspOption = "";
    if (id === "hold" && on) patch.holdReason = "";
    onChange(patch);
    if (DETAIL_FLAGS.has(id)) (on ? close : setOpen)(id, dept);
  }
  function setTires(tires: string[]) {
    const flags = tires.length
      ? entry.flags.includes("retorque")
        ? entry.flags
        : [...entry.flags, "retorque"]
      : entry.flags.filter((f) => f !== "retorque");
    onChange({ ...entry, flags, retorqueTires: tires });
    if (!tires.length) close("retorque");
  }
  function setReason(reason: string) {
    onChange({ ...entry, holdReason: reason });
  }

  function chipLabel(id: string) {
    if (id === "retorque" && isActive("retorque")) return `Retorque · ${retorqueTiresDisplay(entry.retorqueTires)}`;
    if (id === "hold" && isActive("hold") && (entry.holdReason || "").trim()) return `Hold · ${entry.holdReason}`;
    if (id === "inspection" && isActive("inspection")) {
      const o = (entry.inspOption || "").trim() || inspMilesDisplay(entry);
      return o ? `Inspection · ${o}` : "Inspection";
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
                    <InspOptionPicker option={entry.inspOption || ""} onChange={(o) => onChange({ ...entry, inspOption: o })} />
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

interface ManagerPanelProps {
  flags: FlagMap;
  onClose: () => void;
  onBusFlagsUpdated: (bus: string, entry: FlagEntry) => void;
  initialBus?: string;
}

export default function ManagerPanel({ flags, onClose, onBusFlagsUpdated, initialBus = "" }: ManagerPanelProps) {
  const { numbers, isKnown, label } = useBusMaster();
  const [tab, setTab] = useState<"bus" | "flag">("bus");
  const [query, setQuery] = useState(initialBus || "");
  const [openBus, setOpenBus] = useState<string | null>(initialBus || null);
  const [dept, setDept] = useState(DEPARTMENTS[0].id);
  const [pickedFlag, setPickedFlag] = useState(DEPARTMENTS[0].flags[0]);
  const [busInput, setBusInput] = useState("");
  const [pending, setPending] = useState<string[]>([]); // by-flag: buses awaiting a tire/reason

  // Typing a full bus number on the By bus tab opens its flag menu automatically.
  useEffect(() => {
    const t = query.trim();
    if (t && isKnown(t)) setOpenBus(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const getEntry = (bus: string): FlagEntry => flags[bus] || { ...EMPTY };
  function save(bus: string, entry: FlagEntry) {
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
        inspOption: entry.inspOption ?? "",
      }),
    }).catch(() => {});
    onBusFlagsUpdated(bus, entry);
  }

  // By bus: the list to show — matches when searching, else flagged buses.
  const q = query.trim();
  const busList = q
    ? numbers.filter((n) => n.includes(q)).slice(0, 60)
    : Object.keys(flags).filter((b) => entryHasContent(flags[b])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // By flag: buses carrying the picked flag ("Other" = buses with a note).
  const deptObj = DEPARTMENTS.find((d) => d.id === dept) || DEPARTMENTS[0];
  const flagBuses = Object.keys(flags)
    .filter((b) =>
      pickedFlag === NOTE_FLAG ? !!(flags[b].note || "").trim() : (flags[b].flags || []).includes(pickedFlag)
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function addBusToFlag(busArg?: string) {
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
  function removeFromFlag(bus: string) {
    const cur = getEntry(bus);
    if (pickedFlag === NOTE_FLAG) {
      save(bus, { ...cur, note: "" });
      setPending((p) => p.filter((b) => b !== bus));
      return;
    }
    const patch: FlagEntry = { ...cur, flags: cur.flags.filter((f) => f !== pickedFlag) };
    if (pickedFlag === "inspection") patch.inspOption = "";
    if (pickedFlag === "retorque") patch.retorqueTires = [];
    if (pickedFlag === "hold") patch.holdReason = "";
    save(bus, patch);
    setPending((p) => p.filter((b) => b !== bus));
  }
  function setTiresFor(bus: string, tires: string[]) {
    const cur = getEntry(bus);
    const flags2 = tires.length
      ? cur.flags.includes("retorque")
        ? cur.flags
        : [...cur.flags, "retorque"]
      : cur.flags.filter((f) => f !== "retorque");
    save(bus, { ...cur, flags: flags2, retorqueTires: tires });
    if (tires.length) setPending((p) => p.filter((b) => b !== bus));
  }
  function setReasonFor(bus: string, reason: string) {
    save(bus, { ...getEntry(bus), holdReason: reason });
  }
  const isPending = (bus: string) => pending.includes(bus) && !flagBuses.includes(bus);
  const flagRows = REQUIRE_DETAIL.has(pickedFlag)
    ? [...pending.filter((b) => !flagBuses.includes(b)), ...flagBuses]
    : flagBuses;

  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal modal--tall modal--flags"
      label="Edit flags"
    >
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
              <button
                className={`deptchip ${pickedFlag === NOTE_FLAG ? `deptchip--on--${dept}` : ""}`}
                onClick={() => {
                  setPickedFlag(NOTE_FLAG);
                  setPending([]);
                }}
              >
                Other (note)
              </button>
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
                Add a bus, then {pickedFlag === NOTE_FLAG ? "type its note" : `pick its ${pickedFlag === "retorque" ? "tire(s)" : "reason"}`} below —
                it won&apos;t save until you do.
              </div>
            )}

            <div className="byflag__bar">
              <span className="byflag__count">
                {flagBuses.length} bus{flagBuses.length === 1 ? "" : "es"}{" "}
                {pickedFlag === NOTE_FLAG ? "with a note" : `flagged ${flagName(pickedFlag)}`}
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
                      <InspOptionPicker key={bus} option={entry.inspOption || ""} onChange={(o) => save(bus, { ...getEntry(bus), inspOption: o })} />
                    )}
                    {pickedFlag === NOTE_FLAG && (
                      <NoteInput
                        key={bus}
                        value={entry.note}
                        onSave={(n) => {
                          save(bus, { ...getEntry(bus), note: n });
                          if (n.trim()) setPending((p) => p.filter((b) => b !== bus));
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}
