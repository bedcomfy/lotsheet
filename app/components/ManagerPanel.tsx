"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
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
  flagColorStyle,
  flagObjectCodes,
  flagHasDetail,
  flagRequiresDetail,
  inspectionOptionFromText,
  removeInspection,
  setInspectionOption,
} from "../lib/grid";
import { X, Plus, Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import FlagPills from "./FlagPills";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import { getDeviceActor } from "../lib/deviceActor";
import { useAutoSaveText } from "../lib/useAutoSaveText";
import type { FlagEntry, FlagMap } from "../lib/types";
import {
  Button,
  ConfirmDialog,
  Pressable,
  ResponsiveDialog,
  SearchField,
  TabBar,
  TextField,
} from "../ui";
import styles from "./ManagerPanel.module.css";

const EMPTY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
// Pseudo-flag for the By flag tab: "Other" = buses with a free-text note.
const NOTE_FLAG = "__note";
const requiresDetail = (id: string) => id === NOTE_FLAG || flagRequiresDetail(id);
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
  // Auto-saves as you type / on blur / on close — no need to press Enter.
  const { text, onChange, flush, saveNow } = useAutoSaveText(value, onSave);
  return (
    <div className={styles.noteRow}>
      <TextField
        className={styles.detailText}
        label="Note"
        labelHidden
        placeholder="Type a note…"
        value={text}
        onChange={onChange}
        onBlur={flush}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {!!text && (
        <Pressable
          className={styles.noteClear}
          onPress={() => saveNow("")}
          aria-label="Remove note"
        >
          <X size={15} />
        </Pressable>
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
    <div className={`${styles.detailBox} ${styles.detailColumn}`}>
      <div className={styles.detailLabel}>Which tires?</div>
      <div className={styles.tirePicker}>
        <div className={styles.tireHint}>▲ front of bus</div>
        {RETORQUE_TIRES.map((t) => (
          <Pressable
            key={t.id}
            className={`${styles.tireButton} ${set.has(t.id) ? styles.tireButtonSelected : ""}`}
            onPress={() => toggle(t.id)}
          >
            {set.has(t.id) ? "✓ " : ""}
            {t.label}
          </Pressable>
        ))}
        <div className={styles.tireHint}>▼ rear of bus</div>
      </div>
      {summary ? (
        <div className={styles.detailSummary}>
          Shows as <strong>{summary}</strong>
        </div>
      ) : (
        <div className={styles.detailWarning}>Pick at least one tire</div>
      )}
    </div>
  );
}

function HoldReasonPicker({ reason, onChange: onSave }: { reason: string | undefined; onChange: (r: string) => void }) {
  // Same auto-save behavior for the free-text "Other reason".
  const { text, onChange, flush, saveNow } = useAutoSaveText(reason, onSave);
  return (
    <div className={`${styles.detailBox} ${styles.detailColumn}`}>
      <div className={styles.detailLabel}>Hold reason (optional)</div>
      <div className={styles.reasonPicker}>
        {HOLD_REASONS.map((r) => (
          <Pressable
            key={r}
            className={`${styles.choiceChip} ${reason === r ? styles.choiceMaintenance : ""}`}
            onPress={() => saveNow(r)}
          >
            {r}
          </Pressable>
        ))}
      </div>
      <TextField
        className={styles.detailText}
        label="Other hold reason"
        labelHidden
        placeholder="Other reason…"
        value={text}
        onChange={onChange}
        onBlur={flush}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

// Optional inspection type — pick one of A-3 … C-24 (or none).
function FlagCodeHint({ id }: { id: string }) {
  const codes = flagObjectCodes(id);
  if (!codes.length) return null;
  return <small className={styles.flagCode}>Code {codes.slice(0, 2).join(", ")}</small>;
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
    <div className={`${styles.detailBox} ${styles.detailColumn}`}>
      <div className={styles.detailLabel}>Inspection type / follow up</div>
      <div className={styles.reasonPicker}>
        {INSPECTION_OPTIONS.map((o) => (
          <Pressable
            key={o.id}
            className={`${styles.choiceChip} ${
              inspectionOptionFromText(option)?.id === o.id ? styles.choiceService : ""
            }`}
            onPress={() => onChange(inspectionOptionFromText(option)?.id === o.id ? "" : o.id)}
          >
            {o.label}
          </Pressable>
        ))}
        {onFollowUpToggle && (
          <Pressable
            className={`${styles.choiceChip} ${followUpActive ? styles.choiceService : ""}`}
            onPress={onFollowUpToggle}
          >
            Follow up
          </Pressable>
        )}
      </div>
    </div>
  );
}

// ---- the search-first editor for ONE bus ----
// Current flags sit at the top as removable pills; a search box finds any of the
// (many) flags; the handful used daily are one-tap chips when the search is
// empty. Detail flags (hold / inspection / retorque) reveal their picker inline.
function FlagPicker({ entry, onChange, searchRef }: {
  entry: FlagEntry;
  onChange: (e: FlagEntry) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const localSearchRef = useRef<HTMLInputElement>(null);
  const activeSearchRef = searchRef || localSearchRef;
  // Detail flags whose picker is open but not yet satisfied — really only
  // retorque, which isn't "on" until a tire is picked.
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    activeSearchRef.current?.focus({ preventScroll: true });
  }, [activeSearchRef]);

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
      const miles = inspMilesDisplay(entry);
      return miles ? `Inspection · ${miles}` : "Inspection";
    }
    return flagName(id);
  }

  // Active flags as pills, most-severe first (severity == FLAGS order here).
  const active = entry.flags.slice().sort((a, b) => flagLabel(a).localeCompare(flagLabel(b)));
  const results = searchFlags(query);
  const common = commonFlagIds().filter((id) => !entry.flags.includes(id) && !isActive(id));
  const hasNote = !!(entry.note || "").trim();

  return (
    <div className={styles.flagPicker}>
      {active.length > 0 && (
        <div className={styles.activeFlags}>
          {active.map((id) => (
            <span
              className={styles.removableFlag}
              style={flagColorStyle(id) as CSSProperties}
              key={id}
            >
              {pillLabel(id)}
              <Pressable
                className={styles.removeFlag}
                onPress={() => remove(id)}
                aria-label={`Remove ${flagName(id)}`}
              >
                <X size={14} />
              </Pressable>
            </span>
          ))}
        </div>
      )}

      {/* Inline detail pickers for whichever detail flags are active/opening. */}
      {["hold", "inspection", "retorque"]
        .filter((id) => detailShown(id))
        .map((id) => (
          <div className={styles.flagDetail} key={`${id}-detail`}>
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

      <SearchField
        className={styles.flagSearch}
        inputRef={activeSearchRef}
        label="Search flags or object codes"
        labelHidden
        placeholder="Search flags or object codes..."
        value={query}
        onChange={setQuery}
      />

      {query ? (
        <div className={styles.flagResults}>
          {results.length === 0 && <div className={styles.noResults}>No flags match “{query}”.</div>}
          {results.map((f) => {
            const on = isActive(f.id) || entry.flags.includes(f.id);
            return (
              <Pressable
                key={f.id}
                className={`${styles.flagResult} ${on ? styles.flagResultSelected : ""}`}
                onPress={() => {
                  toggle(f.id);
                  setQuery("");
                }}
              >
                <span className={styles.flagResultIcon}>
                  {on ? <Check size={16} /> : <Plus size={16} />}
                </span>
                <span>
                  {flagName(f.id)}
                  <FlagCodeHint id={f.id} />
                </span>
              </Pressable>
            );
          })}
        </div>
      ) : (
        <>
          {common.length > 0 && (
            <div>
              <div className={styles.sectionLabel}>Most used here</div>
              <div className={styles.flagChips}>
                {common.map((id) => (
                  <Pressable key={id} className={styles.flagChip} onPress={() => add(id)}>
                    {flagName(id)}
                    <FlagCodeHint id={id} />
                  </Pressable>
                ))}
              </div>
            </div>
          )}
          <div className={styles.flagHint}>
            <span>{ASSIGNABLE_FLAGS.length} total flags available. Use the field above for object-code flags.</span>
          </div>
        </>
      )}

      <div className={styles.noteBlock}>
        {noteOpen || hasNote ? (
          <>
            <div className={styles.sectionLabel}>Note</div>
            <NoteInput value={entry.note} onSave={(n) => onChange({ ...entry, note: n })} />
          </>
        ) : (
          <Pressable className={styles.addNote} onPress={() => setNoteOpen(true)}>
            <Plus size={15} /> Add a note
          </Pressable>
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
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const flagSearchRef = useRef<HTMLInputElement>(null);

  // Typing a full bus number on the By bus tab opens its flag editor.
  useEffect(() => {
    const t = query.trim();
    if (t && isKnown(t)) setOpenBus(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const getEntry = (bus: string): FlagEntry => flags[bus] || { ...EMPTY };
  function save(bus: string, entry: FlagEntry) {
    const request = fetch("/api/flags", {
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
    }).catch(() => null);
    onBusFlagsUpdated(bus, entry);
    return request;
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
  function entryWithoutPickedFlag(bus: string): FlagEntry {
    const cur = getEntry(bus);
    if (pickedFlag === NOTE_FLAG) {
      return { ...cur, note: "" };
    }
    const patch: FlagEntry = pickedFlag === "inspection"
      ? removeInspection(cur)
      : { ...cur, flags: cur.flags.filter((f) => f !== pickedFlag) };
    if (pickedFlag === "retorque") patch.retorqueTires = [];
    if (pickedFlag === "hold") patch.holdReason = "";
    return patch;
  }
  function removeFromFlag(bus: string) {
    if (isPending(bus)) {
      // Cancelling a bus that was never saved: just drop it, no server write.
      setPending((p) => p.filter((b) => b !== bus));
      setDraftTires((d) => {
        const next = { ...d };
        delete next[bus];
        return next;
      });
      return;
    }
    save(bus, entryWithoutPickedFlag(bus));
    setPending((p) => p.filter((b) => b !== bus));
  }
  async function removeFlagFromAll() {
    if (!flagBuses.length || bulkRemoving) return;
    setBulkRemoving(true);
    let failed = 0;
    try {
      for (const bus of flagBuses) {
        const response = await save(bus, entryWithoutPickedFlag(bus));
        if (!response?.ok) failed += 1;
      }
      setPending([]);
    } finally {
      setBulkRemoving(false);
    }
    if (failed) window.alert(`${failed} bus update${failed === 1 ? "" : "s"} could not be saved. Please try again.`);
  }
  // Tires being picked for a bus that is NOT yet in the flag list. Saving on
  // every tap re-sorted the list mid-entry and the row jumped away — so a
  // pending bus keeps its tires in a local draft until Save is pressed.
  const [draftTires, setDraftTires] = useState<Record<string, string[]>>({});

  function saveDraftTires(bus: string) {
    const tires = draftTires[bus] || [];
    if (!tires.length) return;
    setTiresFor(bus, tires);
    setDraftTires((d) => {
      const next = { ...d };
      delete next[bus];
      return next;
    });
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
    <>
    <ResponsiveDialog
      isOpen={!bulkConfirmOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={tab === "bus" && openBus ? `Bus ${label(openBus)}` : "Edit flags"}
      description={
        tab === "bus" && openBus
          ? typeNames(types(openBus)) || "Add or remove maintenance flags"
          : "Search by bus or manage every bus carrying a flag."
      }
      size="lg"
      scrollMode="contained"
      bodyClassName={styles.body}
      footer={(close) => (
        <Button variant="primary" onPress={close}>
          Done
        </Button>
      )}
    >
      <div className={`${styles.inner} ${tab === "bus" && openBus ? styles.innerFit : ""}`}>
        {tab === "bus" && openBus && (
          <div className={styles.detailBar}>
            <Button variant="quiet" size="sm" onPress={() => setOpenBus(null)}>
              <ChevronLeft aria-hidden="true" /> All buses
            </Button>
          </div>
        )}

        {/* The By bus / By flag tabs are only useful when browsing — hide them
            while editing a single bus so that view stays compact. */}
        {!(tab === "bus" && openBus) && (
          <TabBar
            className={styles.tabs}
            label="Flag editor view"
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key === "flag" ? "flag" : "bus")}
            items={[
              { id: "bus", label: "By bus" },
              { id: "flag", label: "By flag" },
            ]}
          />
        )}

        {tab === "bus" &&
          (openBus ? (
            <div className={styles.list} data-dialog-scroll-region="">
              <FlagPicker key={openBus} entry={getEntry(openBus)} onChange={(e) => save(openBus, e)} searchRef={flagSearchRef} />
            </div>
          ) : (
            <>
              <SearchField
                className={styles.search}
                label="Search bus number"
                labelHidden
                placeholder="Search bus number…"
                value={query}
                inputMode="numeric"
                autoFocus
                onChange={(value) => setQuery(sanitizeBus(value))}
              />
              <div className={styles.list} data-dialog-scroll-region="">
                {busList.length === 0 && (
                  <div className={styles.empty}>
                    {q ? "No buses match." : "No flagged buses yet — search a bus number to flag it."}
                  </div>
                )}
                {busList.map((bus) => {
                  const e = getEntry(bus);
                  const hasContent = (e.flags || []).length > 0 || !!(e.note || "").trim();
                  return (
                    <Pressable className={styles.busRow} key={bus} onPress={() => setOpenBus(bus)}>
                      <div className={styles.busRowMain}>
                        <div className={styles.busRowTop}>
                          <span className={styles.busNumber}>{label(bus)}</span>
                          <TypeCodes num={bus} variant="ui" />
                        </div>
                        <div className={styles.busRowPills}>
                          {hasContent ? (
                            <FlagPills entry={e} />
                          ) : (
                            <span className={styles.busRowNone}>No flags — tap to add</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={styles.chevron} size={18} />
                    </Pressable>
                  );
                })}
              </div>
            </>
          ))}

        {tab === "flag" && (
          <div className={styles.byFlag}>
            <div className={styles.departmentTabs}>
              {departments.map((d) => (
                <Pressable
                  key={d.id}
                  className={`${styles.departmentTab} ${
                    dept === d.id ? styles[`departmentTabSelected${d.id[0].toUpperCase()}${d.id.slice(1)}`] : ""
                  }`}
                  onPress={() => {
                    setDept(d.id);
                    setPickedFlag(d.flags[0]);
                    setPending([]);
                  }}
                >
                  {d.label}
                </Pressable>
              ))}
            </div>

            <div className={styles.departmentFlags}>
              {deptObj.flags.map((id) => (
                <Pressable
                  key={id}
                  className={`${styles.choiceChip} ${
                    pickedFlag === id
                      ? dept === "service"
                        ? styles.choiceService
                        : dept === "maintenance"
                          ? styles.choiceMaintenance
                          : styles.choiceSafety
                      : ""
                  }`}
                  onPress={() => {
                    setPickedFlag(id);
                    setPending([]);
                  }}
                >
                  {flagName(id)}
                  <FlagCodeHint id={id} />
                </Pressable>
              ))}
              <Pressable
                className={`${styles.choiceChip} ${
                  pickedFlag === NOTE_FLAG
                    ? dept === "service"
                      ? styles.choiceService
                      : dept === "maintenance"
                        ? styles.choiceMaintenance
                        : styles.choiceSafety
                    : ""
                }`}
                onPress={() => {
                  setPickedFlag(NOTE_FLAG);
                  setPending([]);
                }}
              >
                Other (note)
              </Pressable>
            </div>

            <div className={styles.addBus}>
              <TextField
                className={styles.busInput}
                label="Add bus number"
                labelHidden
                placeholder="Add bus number..."
                value={busInput}
                inputMode="numeric"
                onChange={(value) => {
                  const v = sanitizeBus(value);
                  if (isKnown(v)) addBusToFlag(v);
                  else setBusInput(v);
                }}
                onKeyDown={(e) => e.key === "Enter" && addBusToFlag()}
              />
              <Button variant="primary" onPress={() => addBusToFlag()}>
                Add
              </Button>
            </div>
            {requiresDetail(pickedFlag) && (
              <div className={styles.byFlagHint}>
                Add a bus, then {pickedFlag === NOTE_FLAG ? "type its note" : `pick its ${pickedFlag === "retorque" ? "tire(s)" : "reason"}`} below —
                it won&apos;t save until you do.
              </div>
            )}

            <div className={styles.byFlagBar}>
              <span className={styles.byFlagCount}>
                {flagBuses.length} bus{flagBuses.length === 1 ? "" : "es"}{" "}
                {pickedFlag === NOTE_FLAG ? "with a note" : `flagged ${flagName(pickedFlag)}`}
              </span>
              {flagBuses.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onPress={() => setBulkConfirmOpen(true)}
                  isDisabled={bulkRemoving}
                >
                  <Trash2 size={14} />
                  {bulkRemoving ? "Removing..." : "Remove from all"}
                </Button>
              )}
            </div>

            <div className={styles.list} data-dialog-scroll-region="">
              {flagRows.map((bus) => {
                const entry = getEntry(bus);
                return (
                  <div className={styles.flagRow} key={bus}>
                    <div className={styles.flagRowHead}>
                      <span className={styles.busNumber}>{label(bus)}</span>
                      <span className={styles.busType}>
                        <TypeCodes num={bus} variant="ui" />
                      </span>
                      <div className={styles.spacer} />
                      <Pressable className={styles.removeBus} onPress={() => removeFromFlag(bus)}>
                        {isPending(bus) ? "Cancel" : "Remove"}
                      </Pressable>
                    </div>
                    {pickedFlag === "retorque" &&
                      (isPending(bus) ? (
                        <>
                          <TirePicker
                            key={bus}
                            tires={draftTires[bus] || []}
                            onChange={(t) => setDraftTires((d) => ({ ...d, [bus]: t }))}
                          />
                          <div className={styles.draftSave}>
                            <Button
                              size="sm"
                              variant="primary"
                              isDisabled={!(draftTires[bus] || []).length}
                              onPress={() => saveDraftTires(bus)}
                            >
                              <Check aria-hidden="true" /> Save bus {label(bus)}
                            </Button>
                            <span className={styles.draftHint}>Pick every tire first — the bus is added when you save.</span>
                          </div>
                        </>
                      ) : (
                        <TirePicker key={bus} tires={entry.retorqueTires || []} onChange={(t) => setTiresFor(bus, t)} />
                      ))}
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
    </ResponsiveDialog>
    <ConfirmDialog
      isOpen={bulkConfirmOpen}
      onOpenChange={setBulkConfirmOpen}
      title="Remove this flag from every bus?"
      description={`This will remove ${
        pickedFlag === NOTE_FLAG ? "all notes" : flagName(pickedFlag)
      } from ${flagBuses.length} matching bus${flagBuses.length === 1 ? "" : "es"}.`}
      confirmLabel="Remove from all"
      tone="danger"
      isPending={bulkRemoving}
      onConfirm={removeFlagFromAll}
    />
    </>
  );
}
