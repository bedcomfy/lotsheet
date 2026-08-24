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
  exactFlagMatch,
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
import { ArrowRight, BusFront, X, Plus, Check, ChevronLeft, ChevronRight, MapPin, Trash2 } from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import FlagPills from "./FlagPills";
import { useBusMaster } from "./BusMasterProvider";
import TypeCodes from "./TypeCodes";
import { getDeviceActor } from "../lib/deviceActor";
import { useAutoSaveText } from "../lib/useAutoSaveText";
import type { FlagEntry, FlagMap } from "../lib/types";
import {
  LEGACY_CUSTOM_NOTE_ID,
  addCustomNote,
  customNoteItems,
  hasCustomNotes,
  isCustomNoteFlag,
  removeAllCustomNotes,
  removeCustomNote,
} from "../lib/customNoteFlags";
import {
  Button,
  ConfirmDialog,
  Pressable,
  ResponsiveDialog,
  SearchField,
  StatusBadge,
  TabBar,
  TextField,
} from "../ui";
import styles from "./ManagerPanel.module.css";

const EMPTY: FlagEntry = { flags: [], note: "", inspMiles: null, holdReason: "", retorqueTires: [], inspOption: "" };
// Pseudo-flag for the By flag tab: every freeform custom-note flag.
const NOTE_FLAG = "__note";
const requiresDetail = (id: string) => id === NOTE_FLAG || flagRequiresDetail(id);

function scrollContainerFor(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  const candidates = [
    element.closest<HTMLElement>("[data-dialog-scroll-region]"),
    element.closest<HTMLElement>("[data-dialog-body]"),
  ].filter((candidate): candidate is HTMLElement => candidate !== null);
  return candidates.find((candidate) => {
    const overflow = window.getComputedStyle(candidate).overflowY;
    return candidate.scrollHeight > candidate.clientHeight && (overflow === "auto" || overflow === "scroll");
  }) || candidates[0] || null;
}

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

// A custom note behaves like a flag: Enter/Add commits one removable chip and
// clears the field so another note can be added immediately.
function CustomNoteComposer({ onAdd }: { onAdd: (value: string) => void }) {
  const [draft, setDraft] = useState("");

  function submit() {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  }

  return (
    <div className={styles.noteComposer}>
      <TextField
        className={styles.noteInput}
        label="Custom flag or note"
        labelHidden
        placeholder="Type a note and press Enter..."
        value={draft}
        onChange={setDraft}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit();
        }}
      />
      <Button size="sm" onPress={submit} isDisabled={!draft.trim()}>
        <Plus aria-hidden="true" /> Add
      </Button>
    </div>
  );
}

type DetailVariant = "panel" | "plain";

export function TirePicker({
  tires,
  onChange,
  variant = "panel",
}: {
  tires: string[] | undefined;
  onChange: (tires: string[]) => void;
  variant?: DetailVariant;
}) {
  const set = new Set(tires || []);
  const fronts = ["cf", "rf"];
  const rears = ["cr", "rr"];
  function toggle(id: string) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(RETORQUE_TIRES.filter((t) => next.has(t.id)).map((t) => t.id));
  }
  const summary = retorqueTiresDisplay(tires);
  return (
    <div className={`${styles.detailBox} ${styles.detailColumn} ${variant === "plain" ? styles.detailPlain : ""}`}>
      <div className={styles.detailHeading}>
        <div className={styles.detailLabel}>Which tires?</div>
        <div className={styles.tirePresets} aria-label="Retorque tire presets">
          <Pressable className={styles.tirePreset} onPress={() => onChange(fronts)}>Fronts</Pressable>
          <Pressable className={styles.tirePreset} onPress={() => onChange(rears)}>Rears</Pressable>
          <Pressable className={styles.tirePreset} onPress={() => onChange(RETORQUE_TIRES.map((t) => t.id))}>All</Pressable>
          {set.size > 0 && <Pressable className={styles.tirePreset} onPress={() => onChange([])}>Clear</Pressable>}
        </div>
      </div>
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

export function HoldReasonPicker({
  reason,
  onChange: onSave,
  variant = "panel",
}: {
  reason: string | undefined;
  onChange: (r: string) => void;
  variant?: DetailVariant;
}) {
  // Same auto-save behavior for the free-text "Other reason".
  const { text, onChange, flush, saveNow } = useAutoSaveText(reason, onSave);
  return (
    <div className={`${styles.detailBox} ${styles.detailColumn} ${variant === "plain" ? styles.detailPlain : ""}`}>
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

export function InspOptionPicker({
  option,
  onChange,
  followUpActive = false,
  onFollowUpToggle,
  variant = "panel",
}: {
  option: string | undefined;
  onChange: (o: string) => void;
  followUpActive?: boolean;
  onFollowUpToggle?: () => void;
  variant?: DetailVariant;
}) {
  return (
    <div className={`${styles.detailBox} ${styles.detailColumn} ${variant === "plain" ? styles.detailPlain : ""}`}>
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
export function FlagPicker({ entry, onChange, searchRef }: {
  entry: FlagEntry;
  onChange: (e: FlagEntry) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const localSearchRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeSearchRef = searchRef || localSearchRef;
  // Detail flags whose picker is open but not yet satisfied — really only
  // retorque, which isn't "on" until a tire is picked.
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());

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

  function resetComposer() {
    setQuery("");
    requestAnimationFrame(() => activeSearchRef.current?.focus({ preventScroll: true }));
  }

  // Add a flag (or, if it's already on, just make sure its picker is showing).
  function add(id: string, sourceText = "") {
    if (id === "retorque") {
      if (!isActive("retorque")) openDetail("retorque"); // flag lands once a tire is picked
      return;
    }
    if (id === "inspection") {
      const option = inspectionOptionFromText(sourceText);
      if (option) {
        onChange(setInspectionOption(entry, option.id));
        openDetail(id);
        return;
      }
    }
    if (!entry.flags.includes(id)) onChange({ ...entry, flags: [...entry.flags, id] });
    if (flagHasDetail(id)) openDetail(id);
  }
  function remove(id: string) {
    if (isCustomNoteFlag(id)) {
      onChange(removeCustomNote(entry, id));
      return;
    }
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
  function chooseFlag(id: string) {
    add(id, query);
    resetComposer();
  }
  function commitQuery() {
    const value = query.trim();
    if (!value) return;
    const known = exactFlagMatch(value);
    if (known) add(known.id, value);
    else onChange(addCustomNote(entry, value));
    resetComposer();
  }
  function setTires(tires: string[]) {
    const flags = tires.length
      ? entry.flags.includes("retorque")
        ? entry.flags
        : [...entry.flags, "retorque"]
      : entry.flags.filter((f) => f !== "retorque");
    const scrollRegion = scrollContainerFor(pickerRef.current);
    const scrollTop = scrollRegion?.scrollTop;
    onChange({ ...entry, flags, retorqueTires: tires });
    if (scrollRegion && scrollTop !== undefined) {
      requestAnimationFrame(() => {
        scrollRegion.scrollTop = scrollTop;
      });
    }
  }

  function pillLabel(id: string) {
    if (id === "retorque") return `Retorque · ${retorqueTiresDisplay(entry.retorqueTires)}`;
    if (id === "hold" && (entry.holdReason || "").trim()) return `Hold · ${entry.holdReason}`;
    if (id === "inspection") {
      const option = inspectionOptionFromText(entry.inspOption);
      const detail = option ? flagName(`object:${option.objectCode}`) : inspMilesDisplay(entry);
      return detail ? `Inspection · ${detail}` : "Inspection";
    }
    return flagName(id);
  }

  const inspectionMatch = query ? inspectionOptionFromText(query) : null;
  const exactMatch = query ? exactFlagMatch(query) : null;
  const linkedInspectionObjectId = inspectionOptionFromText(entry.inspOption)?.objectCode;

  // Active flags as pills, most-severe first (severity == FLAGS order here).
  // The inspection object code is already represented by the richer Inspection
  // pill, so showing both only makes one issue look like two separate problems.
  const active = entry.flags
    .filter((id) => id !== (linkedInspectionObjectId ? `object:${linkedInspectionObjectId}` : ""))
    .sort((a, b) => {
    const noteOrder = Number(isCustomNoteFlag(a)) - Number(isCustomNoteFlag(b));
    return noteOrder || flagLabel(a).localeCompare(flagLabel(b));
  });
  const results = searchFlags(query).filter((result) => !(inspectionMatch && result.id === "inspection"));
  const common = commonFlagIds().filter((id) => !entry.flags.includes(id) && !isActive(id));
  const legacyNote = (entry.note || "").trim();

  return (
    <div ref={pickerRef} className={styles.flagPicker}>
      {(active.length > 0 || legacyNote) && (
        <div className={styles.currentFlags}>
          <div className={styles.sectionLabel}>Current issues</div>
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
            {legacyNote && (
              <span
                className={styles.removableFlag}
                style={flagColorStyle(null) as CSSProperties}
              >
                {legacyNote}
                <Pressable
                  className={styles.removeFlag}
                  onPress={() => onChange(removeCustomNote(entry, LEGACY_CUSTOM_NOTE_ID))}
                  aria-label={`Remove ${legacyNote}`}
                >
                  <X size={14} />
                </Pressable>
              </span>
            )}
          </div>
        </div>
      )}

      <SearchField
        className={styles.flagSearch}
        inputRef={activeSearchRef}
        label="Add an issue"
        placeholder="Flag, object code, or a plain-language note"
        description="Choose a match below. If there is no match, Enter saves your words as a removable note."
        value={query}
        onChange={setQuery}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commitQuery();
        }}
      />

      {query ? (
        <div className={styles.flagResults}>
          {inspectionMatch && (
            <Pressable
              className={`${styles.flagResult} ${isActive("inspection") ? styles.flagResultSelected : ""}`}
              onPress={() => {
                add("inspection", query);
                resetComposer();
              }}
            >
              <span className={styles.flagResultIcon}>
                {isActive("inspection") ? <Check size={16} /> : <Plus size={16} />}
              </span>
              <span>
                Inspection · {inspectionMatch.label}
                <small className={styles.flagCode}>Code {inspectionMatch.objectCode}</small>
              </span>
            </Pressable>
          )}
          {results.map((f) => {
            const on = isActive(f.id) || entry.flags.includes(f.id);
            return (
              <Pressable
                key={f.id}
                className={`${styles.flagResult} ${on ? styles.flagResultSelected : ""}`}
                onPress={() => chooseFlag(f.id)}
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
          {!exactMatch && (
            <Pressable className={`${styles.flagResult} ${styles.noteResult}`} onPress={commitQuery}>
              <span className={styles.flagResultIcon}><Plus size={16} /></span>
              <span>
                Add note “{query.trim()}”
                <small className={styles.flagCode}>Creates a removable custom flag</small>
              </span>
            </Pressable>
          )}
        </div>
      ) : (
        <>
          {common.length > 0 && (
            <div className={styles.suggestions}>
              <div className={styles.sectionLabel}>Common actions</div>
              <div className={styles.flagChips} aria-label="Common flags">
                {common.map((id) => (
                  <Pressable key={id} className={styles.flagChip} onPress={() => add(id)}>
                    <Plus aria-hidden="true" size={15} />
                    <span>
                      {flagName(id)}
                      <FlagCodeHint id={id} />
                    </span>
                  </Pressable>
                ))}
              </div>
            </div>
          )}
          <div className={styles.flagHint}>{ASSIGNABLE_FLAGS.length} searchable flags and object codes.</div>
        </>
      )}

      {/* Keep contextual choices beside the action that opened them. */}
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
    </div>
  );
}

export type BusWorkspaceStatus = "ready" | "notReady" | "offProperty" | "missing" | "retired";

export interface BusWorkspaceDetails {
  bus: string;
  label: string;
  model?: string;
  location?: string;
  status?: BusWorkspaceStatus;
}

const WORKSPACE_STATUS: Record<BusWorkspaceStatus, {
  label: string;
  tone: "success" | "warning" | "info" | "danger" | "neutral";
}> = {
  ready: { label: "Ready for service", tone: "success" },
  notReady: { label: "Not ready for service", tone: "warning" },
  offProperty: { label: "Off property", tone: "info" },
  missing: { label: "Missing", tone: "danger" },
  retired: { label: "Retired", tone: "neutral" },
};

export function BusWorkspaceContent({
  details,
  entry,
  onEntryChange,
  onBack,
  onClearFlags,
  onOpenLotSheet,
  searchRef,
}: {
  details: BusWorkspaceDetails;
  entry: FlagEntry;
  onEntryChange: (entry: FlagEntry) => void;
  onBack?: () => void;
  onClearFlags?: () => void;
  onOpenLotSheet?: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const status = details.status ? WORKSPACE_STATUS[details.status] : null;
  return (
    <div className={styles.workspace}>
      {onBack && (
        <Button className={styles.workspaceBack} variant="quiet" size="sm" onPress={onBack}>
          <ChevronLeft aria-hidden="true" /> All buses
        </Button>
      )}

      <section className={styles.workspaceIdentity} aria-label={`Bus ${details.label}`}>
        <span className={styles.workspaceBusIcon} aria-hidden="true"><BusFront /></span>
        <div className={styles.workspaceIdentityCopy}>
          <div className={styles.workspaceBusLine}>
            <strong>{details.label}</strong>
            <TypeCodes num={details.bus} variant="ui" />
          </div>
          <span>{details.model || "Fleet bus"}</span>
          {(status || details.location) && (
            <div className={styles.workspaceMeta}>
              {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
              {details.location && (
                <span className={styles.workspaceLocation}>
                  <MapPin aria-hidden="true" /> {details.location}
                </span>
              )}
            </div>
          )}
        </div>
        <div className={styles.workspaceTopActions}>
          {onOpenLotSheet && (
            <Button variant="quiet" size="sm" onPress={onOpenLotSheet}>
              Lot Sheet <ArrowRight aria-hidden="true" />
            </Button>
          )}
          {onClearFlags && (
            <Button
              className={styles.workspaceClear}
              variant="quiet"
              size="sm"
              isDisabled={!entryHasContent(entry)}
              onPress={onClearFlags}
            >
              <Trash2 aria-hidden="true" /> Clear
            </Button>
          )}
        </div>
      </section>

      <section className={styles.workspaceEditor} aria-labelledby={`bus-${details.bus}-flags`}>
        <div className={styles.workspaceEditorHeading}>
          <h3 id={`bus-${details.bus}-flags`}>Service and maintenance</h3>
        </div>
        <FlagPicker entry={entry} onChange={onEntryChange} searchRef={searchRef} />
      </section>
    </div>
  );
}

interface ManagerPanelProps {
  flags: FlagMap;
  onClose: () => void;
  onBusFlagsUpdated: (bus: string, entry: FlagEntry) => void;
  initialBus?: string;
  initialDetails?: BusWorkspaceDetails | null;
  onOpenLotSheet?: (bus: string) => void;
}

export default function ManagerPanel({
  flags,
  onClose,
  onBusFlagsUpdated,
  initialBus = "",
  initialDetails,
  onOpenLotSheet,
}: ManagerPanelProps) {
  const { master, numbers, isKnown, label, types } = useBusMaster();
  const departments = departmentGroups();
  const [tab, setTab] = useState<"bus" | "flag">("bus");
  const [query, setQuery] = useState(initialBus || "");
  const [openBus, setOpenBus] = useState<string | null>(initialBus || null);
  const [dept, setDept] = useState(departments[0].id);
  const [pickedFlag, setPickedFlag] = useState(departments[0].flags[0]);
  const [busInput, setBusInput] = useState("");
  const [pending, setPending] = useState<string[]>([]); // by-flag: buses awaiting a tire/reason
  const [pinnedFlagBus, setPinnedFlagBus] = useState<string | null>(null);
  const [draftTires, setDraftTires] = useState<Record<string, string[]>>({});
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [clearBusTarget, setClearBusTarget] = useState<string | null>(null);
  const [clearingBus, setClearingBus] = useState(false);
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

  async function clearBusFlags() {
    if (!clearBusTarget || clearingBus) return;
    setClearingBus(true);
    try {
      await save(clearBusTarget, { ...EMPTY, flags: [], retorqueTires: [] });
    } finally {
      setClearingBus(false);
    }
  }

  // By bus: the list to show — matches when searching, else flagged buses.
  const q = query.trim();
  const busList = q
    ? numbers.filter((n) => n.includes(q)).slice(0, 60)
    : Object.keys(flags)
        .filter((b) => entryHasContent(flags[b]))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // By flag: buses carrying the picked flag (Custom notes includes legacy
  // single-note records as well as the new independently removable notes).
  const deptObj = departments.find((d) => d.id === dept) || departments[0];
  const flagBuses = Object.keys(flags)
    .filter((b) =>
      pickedFlag === NOTE_FLAG ? hasCustomNotes(flags[b]) : (flags[b].flags || []).includes(pickedFlag)
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function addBusToFlag(busArg?: string) {
    const bus = sanitizeBus(busArg != null ? busArg : busInput);
    if (bus.length < 4) return;
    setBusInput("");
    if (flagHasDetail(pickedFlag)) setPinnedFlagBus(bus);
    if (requiresDetail(pickedFlag)) {
      if (!flagBuses.includes(bus) && !pending.includes(bus)) setPending((p) => [...p, bus]);
      if (pickedFlag === "retorque") {
        setDraftTires((drafts) => ({
          ...drafts,
          [bus]: drafts[bus] || getEntry(bus).retorqueTires || [],
        }));
      }
      return;
    }
    const cur = getEntry(bus);
    if (!cur.flags.includes(pickedFlag)) save(bus, { ...cur, flags: [...cur.flags, pickedFlag] });
  }
  function entryWithoutPickedFlag(bus: string): FlagEntry {
    const cur = getEntry(bus);
    if (pickedFlag === NOTE_FLAG) {
      return removeAllCustomNotes(cur);
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
      if (pinnedFlagBus === bus) setPinnedFlagBus(null);
      return;
    }
    save(bus, entryWithoutPickedFlag(bus));
    setPending((p) => p.filter((b) => b !== bus));
    setDraftTires((drafts) => {
      const next = { ...drafts };
      delete next[bus];
      return next;
    });
    if (pinnedFlagBus === bus) setPinnedFlagBus(null);
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
  function setTiresFor(bus: string, tires: string[]) {
    setDraftTires((drafts) => ({ ...drafts, [bus]: tires }));
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
  function addNoteFor(bus: string, value: string) {
    const current = getEntry(bus);
    const next = addCustomNote(current, value);
    if (next !== current) save(bus, next);
    if (hasCustomNotes(next)) setPending((items) => items.filter((item) => item !== bus));
  }
  function removeNoteFor(bus: string, id: string) {
    save(bus, removeCustomNote(getEntry(bus), id));
  }
  const isPending = (bus: string) => pending.includes(bus) && !flagBuses.includes(bus);
  const baseFlagRows = requiresDetail(pickedFlag)
    ? [...pending.filter((b) => !flagBuses.includes(b)), ...flagBuses]
    : flagBuses;
  const flagRows = pinnedFlagBus && flagHasDetail(pickedFlag) && baseFlagRows.includes(pinnedFlagBus)
    ? [pinnedFlagBus, ...baseFlagRows.filter((bus) => bus !== pinnedFlagBus)]
    : baseFlagRows;
  const workspaceDetails: BusWorkspaceDetails | null = openBus
    ? initialDetails?.bus === openBus
      ? initialDetails
      : {
          bus: openBus,
          label: label(openBus),
          model: master.buses.find((bus) => bus.num === openBus)?.model || typeNames(types(openBus)),
        }
    : null;

  return (
    <>
    <ResponsiveDialog
      isOpen={!bulkConfirmOpen && !clearBusTarget}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={tab === "bus" && openBus ? `Bus ${workspaceDetails?.label || openBus}` : "Edit flags"}
      description={
        tab === "bus" && openBus
          ? "Review the bus and update every flag or note in one place."
          : "Search by bus or manage every bus carrying a flag."
      }
      size="lg"
      scrollMode={tab === "bus" && openBus ? "body" : "contained"}
      bodyClassName={tab === "bus" && openBus ? styles.bodyCompact : styles.body}
      footer={tab === "bus" && openBus ? undefined : (close) => (
        <Button variant="primary" onPress={close}>Done</Button>
      )}
    >
      <div className={`${styles.inner} ${tab === "bus" && openBus ? styles.innerFit : ""}`}>
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
              {workspaceDetails && (
                <BusWorkspaceContent
                  key={openBus}
                  details={workspaceDetails}
                  entry={getEntry(openBus)}
                  onEntryChange={(entry) => save(openBus, entry)}
                  onBack={initialBus ? undefined : () => setOpenBus(null)}
                  onClearFlags={() => setClearBusTarget(openBus)}
                  onOpenLotSheet={onOpenLotSheet ? () => onOpenLotSheet(openBus) : undefined}
                  searchRef={flagSearchRef}
                />
              )}
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
                    setPinnedFlagBus(null);
                    setDraftTires({});
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
                    setPinnedFlagBus(null);
                    setDraftTires({});
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
                  setPinnedFlagBus(null);
                  setDraftTires({});
                }}
              >
                Custom notes
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
                {pickedFlag === NOTE_FLAG
                  ? "Add a bus, then add one or more custom notes below."
                  : pickedFlag === "retorque"
                    ? "Add a bus, then choose its tires."
                    : pickedFlag === "inspection"
                      ? "Add a bus, then choose its inspection type."
                      : "Add a bus, then choose its hold reason."}
              </div>
            )}

            <div className={styles.byFlagBar}>
              <span className={styles.byFlagCount}>
                {flagBuses.length} bus{flagBuses.length === 1 ? "" : "es"}{" "}
                {pickedFlag === NOTE_FLAG ? "with custom notes" : `flagged ${flagName(pickedFlag)}`}
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
                        {isPending(bus) ? "Cancel" : pickedFlag === NOTE_FLAG ? "Remove all" : "Remove"}
                      </Pressable>
                    </div>
                    {pickedFlag === "retorque" && (
                      <>
                        <TirePicker
                          key={bus}
                          tires={draftTires[bus] ?? entry.retorqueTires ?? []}
                          onChange={(tires) => setTiresFor(bus, tires)}
                        />
                      </>
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
                      <div className={styles.customNoteEditor} key={bus}>
                        {customNoteItems(entry).length > 0 && (
                          <div className={styles.activeFlags}>
                            {customNoteItems(entry).map((item) => (
                              <span
                                className={styles.removableFlag}
                                style={flagColorStyle(null) as CSSProperties}
                                key={item.id}
                              >
                                {item.text}
                                <Pressable
                                  className={styles.removeFlag}
                                  onPress={() => removeNoteFor(bus, item.id)}
                                  aria-label={`Remove ${item.text}`}
                                >
                                  <X size={14} />
                                </Pressable>
                              </span>
                            ))}
                          </div>
                        )}
                        <CustomNoteComposer onAdd={(value) => addNoteFor(bus, value)} />
                      </div>
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
        pickedFlag === NOTE_FLAG ? "all custom notes" : flagName(pickedFlag)
      } from ${flagBuses.length} matching bus${flagBuses.length === 1 ? "" : "es"}.`}
      confirmLabel="Remove from all"
      tone="danger"
      isPending={bulkRemoving}
      onConfirm={removeFlagFromAll}
    />
    <ConfirmDialog
      isOpen={clearBusTarget !== null}
      onOpenChange={(open) => {
        if (!open) setClearBusTarget(null);
      }}
      title={`Clear every flag from bus ${clearBusTarget ? label(clearBusTarget) : ""}?`}
      description="This removes all flags, flag details, and custom notes from this bus. Its location on the sheets will not change."
      confirmLabel="Clear flags"
      tone="danger"
      isPending={clearingBus}
      onConfirm={clearBusFlags}
    />
    </>
  );
}
