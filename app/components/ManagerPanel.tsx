"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  departmentGroups,
  flagName,
  flagLabel,
  RETORQUE_TIRES,
  retorqueTiresDisplay,
  HOLD_REASONS,
  inspMilesDisplay,
  INSPECTION_OPTIONS,
  entryHasContent,
  searchFlags,
  commonFlagIds,
  ASSIGNABLE_FLAGS,
  typeInfo,
  flagTier,
  flagColorStyle,
  flagObjectCodes,
  flagHasDetail,
  flagRequiresDetail,
  inspectionOptionFromText,
  inspectionOptionLabel,
  removeInspection,
  setInspectionOption,
} from "../lib/grid";
import { X, Plus, Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import Overlay, { closeOverlayFromEvent } from "./Overlay";
import FlagPills from "./FlagPills";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import { getDeviceActor } from "../lib/deviceActor";
import type { FlagEntry, FlagMap } from "../lib/types";

const EMPTY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
// Pseudo-flag for the By flag tab: "Other" = buses with a free-text note.
const NOTE_FLAG = "__note";
const requiresDetail = (id: string) => id === NOTE_FLAG || flagRequiresDetail(id);
// Pill color follows severity, reusing the department pill palettes:
// high = red (safety palette), med = amber (maintenance), low = blue (service).
const TIER_CLASS: Record<string, string> = { high: "safety", med: "maintenance", low: "service" };
// Full type name(s) for a bus (e.g. "Pulse", "Pulse · Hybrid"). The master's
// types() gives category ids or lot codes, so match on either.
function typeNames(codes: string[]): string {
  // Only name types that actually show a badge (Standard/empty-code types are silent).
  return codes
    .map((c) => typeInfo(c))
    .filter((t) => t && t.code)
    .map((t) => t!.label)
    .join(" · ");
}

// ---- detail pickers (shown inline under an active detail flag) ----
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
function FlagCodeHint({ id }: { id: string }) {
  const codes = flagObjectCodes(id);
  if (!codes.length) return null;
  return <small className="flagcode">Code {codes.slice(0, 2).join(", ")}</small>;
}

function InspOptionPicker({
  option,
  onChange,
  followUpActive = false,
  onFollowUpToggle,
}: {
  option: string | undefined;
  onChange: (o: string) => void;
  followUpActive?: boolean;
  onFollowUpToggle?: () => void;
}) {
  return (
    <div className="detailbox detailbox--col">
      <div className="detailbox__label">Inspection type / follow up</div>
      <div className="reasonpick">
        {INSPECTION_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`deptchip ${inspectionOptionFromText(option)?.id === o.id ? "deptchip--on--service" : ""}`}
            onClick={() => onChange(inspectionOptionFromText(option)?.id === o.id ? "" : o.id)}
          >
            {o.label}
          </button>
        ))}
        {onFollowUpToggle && (
          <button
            type="button"
            className={`deptchip ${followUpActive ? "deptchip--on--service" : ""}`}
            onClick={onFollowUpToggle}
          >
            Follow up
          </button>
        )}
      </div>
    </div>
  );
}

// ---- the search-first editor for ONE bus ----
// Current flags sit at the top as removable pills; a search box finds any of the
// (many) flags; the handful used daily are one-tap chips when the search is
// empty. Detail flags (hold / inspection / retorque) reveal their picker inline.
function FlagPicker({ entry, onChange }: { entry: FlagEntry; onChange: (e: FlagEntry) => void }) {
  const [query, setQuery] = useState("");
  // Detail flags whose picker is open but not yet satisfied — really only
  // retorque, which isn't "on" until a tire is picked.
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [noteOpen, setNoteOpen] = useState(false);

  const isActive = (id: string) =>
    id === "retorque" ? (entry.retorqueTires || []).length > 0 : entry.flags.includes(id);
  const detailShown = (id: string) => isActive(id) || openDetails.has(id);
  const openDetail = (id: string) => setOpenDetails((s) => new Set(s).add(id));
  const closeDetail = (id: string) =>
    setOpenDetails((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  // Add a flag (or, if it's already on, just make sure its picker is showing).
  function add(id: string) {
    if (id === "retorque") {
      if (!isActive("retorque")) openDetail("retorque"); // flag lands once a tire is picked
      return;
    }
    if (!entry.flags.includes(id)) onChange({ ...entry, flags: [...entry.flags, id] });
    if (flagHasDetail(id)) openDetail(id);
  }
  function remove(id: string) {
    const linkedInspectionFlag = inspectionOptionFromText(entry.inspOption);
    if (id === "inspection") {
      onChange(removeInspection(entry));
      closeDetail(id);
      return;
    }
    if (linkedInspectionFlag && id === `object:${linkedInspectionFlag.objectCode}`) {
      onChange(setInspectionOption(entry, ""));
      return;
    }
    const patch: FlagEntry = { ...entry, flags: entry.flags.filter((f) => f !== id) };
    if (id === "hold") patch.holdReason = "";
    if (id === "retorque") patch.retorqueTires = [];
    onChange(patch);
    closeDetail(id);
  }
  // Search results / chips toggle: on -> off, off -> on.
  function toggle(id: string) {
    if (isActive(id) || (id !== "retorque" && entry.flags.includes(id))) remove(id);
    else add(id);
  }
  function setTires(tires: string[]) {
    const flags = tires.length
      ? entry.flags.includes("retorque")
        ? entry.flags
        : [...entry.flags, "retorque"]
      : entry.flags.filter((f) => f !== "retorque");
    onChange({ ...entry, flags, retorqueTires: tires });
  }

  function pillLabel(id: string) {
    if (id === "retorque") return `Retorque · ${retorqueTiresDisplay(entry.retorqueTires)}`;
    if (id === "hold" && (entry.holdReason || "").trim()) return `Hold · ${entry.holdReason}`;
    if (id === "inspection") {
      const o = inspectionOptionLabel(entry.inspOption) || inspMilesDisplay(entry);
      return o ? `Inspection · ${o}` : "Inspection";
    }
    return flagName(id);
  }

  // Active flags as pills, most-severe first (severity == FLAGS order here).
  const active = entry.flags.slice().sort((a, b) => flagLabel(a).localeCompare(flagLabel(b)));
  const results = searchFlags(query);
  const common = commonFlagIds().filter((id) => !entry.flags.includes(id) && !isActive(id));
  const hasNote = !!(entry.note || "").trim();

  return (
    <div className="flagpick">
      {active.length > 0 && (
        <div className="flagpick__active">
          {active.map((id) => (
            <span className={`fpill fpill--${TIER_CLASS[flagTier(id)]} fpill--custom`} style={flagColorStyle(id) as CSSProperties} key={id}>
              {pillLabel(id)}
              <button className="fpill__x" onClick={() => remove(id)} aria-label={`Remove ${flagName(id)}`}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Inline detail pickers for whichever detail flags are active/opening. */}
      {["hold", "inspection", "retorque"]
        .filter((id) => detailShown(id))
        .map((id) => (
          <div className="flagpick__detail" key={`${id}-detail`}>
            {id === "retorque" && <TirePicker tires={entry.retorqueTires || []} onChange={setTires} />}
            {id === "hold" && (
              <HoldReasonPicker reason={entry.holdReason || ""} onChange={(r) => onChange({ ...entry, holdReason: r })} />
            )}
            {id === "inspection" && (
              <InspOptionPicker
                option={entry.inspOption || ""}
                onChange={(o) => onChange(setInspectionOption(entry, o))}
                followUpActive={entry.flags.includes("followup")}
                onFollowUpToggle={() => {
                  const flags = entry.flags.includes("followup")
                    ? entry.flags.filter((f) => f !== "followup")
                    : [...entry.flags, "followup"];
                  onChange({ ...entry, flags });
                }}
              />
            )}
          </div>
        ))}

      <div className="flagpick__searchwrap">
        <Search size={17} className="flagpick__searchic" />
        <input
          className="flagpick__search"
          placeholder="Search flags or object codes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!!query && (
          <button className="flagpick__searchx" onClick={() => setQuery("")} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </div>

      {query ? (
        <div className="flagpick__results">
          {results.length === 0 && <div className="flagpick__none">No flags match “{query}”.</div>}
          {results.map((f) => {
            const on = isActive(f.id) || entry.flags.includes(f.id);
            return (
              <button
                key={f.id}
                className={`flagresult ${on ? "flagresult--on" : ""}`}
                onClick={() => {
                  toggle(f.id);
                  setQuery("");
                }}
              >
                <span className="flagresult__ic">{on ? <Check size={16} /> : <Plus size={16} />}</span>
                <span>
                  {flagName(f.id)}
                  <FlagCodeHint id={f.id} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {common.length > 0 && (
            <div>
              <div className="flagpick__label">Most used here</div>
              <div className="flagpick__chips">
                {common.map((id) => (
                  <button key={id} className="flagchip" onClick={() => add(id)}>
                    {flagName(id)}
                    <FlagCodeHint id={id} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flagpick__hint">
            <span>{ASSIGNABLE_FLAGS.length} total flags available. Use the field above for object-code flags.</span>
          </div>
        </>
      )}

      <div className="flagpick__noteblock">
        {noteOpen || hasNote ? (
          <>
            <div className="flagpick__label">Note</div>
            <NoteInput value={entry.note} onSave={(n) => onChange({ ...entry, note: n })} />
          </>
        ) : (
          <button className="flagpick__addnote" onClick={() => setNoteOpen(true)}>
            <Plus size={15} /> Add a note
          </button>
        )}
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
  const { numbers, isKnown, label, types } = useBusMaster();
  const departments = departmentGroups();
  const [tab, setTab] = useState<"bus" | "flag">("bus");
  const [query, setQuery] = useState(initialBus || "");
  const [openBus, setOpenBus] = useState<string | null>(initialBus || null);
  const [dept, setDept] = useState(departments[0].id);
  const [pickedFlag, setPickedFlag] = useState(departments[0].flags[0]);
  const [busInput, setBusInput] = useState("");
  const [pending, setPending] = useState<string[]>([]); // by-flag: buses awaiting a tire/reason

  // Typing a full bus number on the By bus tab opens its flag editor.
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
        actor: getDeviceActor(),
      }),
    }).catch(() => {});
    onBusFlagsUpdated(bus, entry);
  }

  // By bus: the list to show — matches when searching, else flagged buses.
  const q = query.trim();
  const busList = q
    ? numbers.filter((n) => n.includes(q)).slice(0, 60)
    : Object.keys(flags)
        .filter((b) => entryHasContent(flags[b]))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // By flag: buses carrying the picked flag ("Other" = buses with a note).
  const deptObj = departments.find((d) => d.id === dept) || departments[0];
  const flagBuses = Object.keys(flags)
    .filter((b) =>
      pickedFlag === NOTE_FLAG ? !!(flags[b].note || "").trim() : (flags[b].flags || []).includes(pickedFlag)
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function addBusToFlag(busArg?: string) {
    const bus = sanitizeBus(busArg != null ? busArg : busInput);
    if (bus.length < 4) return;
    setBusInput("");
    if (requiresDetail(pickedFlag)) {
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
    const patch: FlagEntry = pickedFlag === "inspection"
      ? removeInspection(cur)
      : { ...cur, flags: cur.flags.filter((f) => f !== pickedFlag) };
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
  const flagRows = requiresDetail(pickedFlag)
    ? [...pending.filter((b) => !flagBuses.includes(b)), ...flagBuses]
    : flagBuses;

  return (
    <Overlay
      onClose={onClose}
      overlayClassName="modal-backdrop no-print"
      contentClassName="modal modal--tall modal--flags"
      label="Edit flags"
    >
      <div className={`manager__inner${tab === "bus" && openBus ? " manager__inner--fit" : ""}`}>
        <div className="manager__bar">
          {tab === "bus" && openBus ? (
            <>
              <button className="busdetail__back" onClick={() => setOpenBus(null)} aria-label="Back to bus list">
                <ChevronLeft size={20} />
              </button>
              <span className="busdetail__num">{label(openBus)}</span>
              {typeNames(types(openBus)).length > 0 && (
                <span className="busdetail__type">{typeNames(types(openBus))}</span>
              )}
            </>
          ) : (
            <div className="manager__title">Edit flags</div>
          )}
          <div className="toolbar__spacer" />
          <button className="btn" onClick={closeOverlayFromEvent}>
            Done
          </button>
        </div>

        {/* The By bus / By flag tabs are only useful when browsing — hide them
            while editing a single bus so that view stays compact. */}
        {!(tab === "bus" && openBus) && (
          <div className="tabs">
            <button className={`tab ${tab === "bus" ? "tab--on" : ""}`} onClick={() => setTab("bus")}>
              By bus
            </button>
            <button className={`tab ${tab === "flag" ? "tab--on" : ""}`} onClick={() => setTab("flag")}>
              By flag
            </button>
          </div>
        )}

        {tab === "bus" &&
          (openBus ? (
            <div className="manager__list">
              <FlagPicker key={openBus} entry={getEntry(openBus)} onChange={(e) => save(openBus, e)} />
            </div>
          ) : (
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
                  const e = getEntry(bus);
                  const hasContent = (e.flags || []).length > 0 || !!(e.note || "").trim();
                  return (
                    <button className="busrow" key={bus} onClick={() => setOpenBus(bus)}>
                      <div className="busrow__main">
                        <div className="busrow__top">
                          <span className="busrow__num">{label(bus)}</span>
                          <TypeCodes num={bus} />
                        </div>
                        <div className="busrow__pills">
                          {hasContent ? (
                            <FlagPills entry={e} />
                          ) : (
                            <span className="busrow__none">No flags — tap to add</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="busrow__chev" size={18} />
                    </button>
                  );
                })}
              </div>
            </>
          ))}

        {tab === "flag" && (
          <div className="byflag">
            <div className="depttabs">
              {departments.map((d) => (
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
                  <FlagCodeHint id={id} />
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
                placeholder="Add bus number..."
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
            {requiresDetail(pickedFlag) && (
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
                      <InspOptionPicker
                        key={bus}
                        option={entry.inspOption || ""}
                        onChange={(o) => save(bus, setInspectionOption(getEntry(bus), o))}
                        followUpActive={(entry.flags || []).includes("followup")}
                        onFollowUpToggle={() => {
                          const cur = getEntry(bus);
                          const flags2 = cur.flags.includes("followup")
                            ? cur.flags.filter((f) => f !== "followup")
                            : [...cur.flags, "followup"];
                          save(bus, { ...cur, flags: flags2 });
                        }}
                      />
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
