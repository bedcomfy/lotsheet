"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  ClipboardCheck,
  Eraser,
  History,
  Plus,
  Trash2,
} from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { getDeviceActor } from "../lib/deviceActor";
import { setInspectionOption } from "../lib/grid";
import {
  BRING_TO_CARDS_FLAGS,
  addStagedServiceFlag,
  bringToCardsKind,
  bringToCardsReason,
  describeServiceLaneEntry,
  diffServiceLaneSetup,
  emptyFlagEntry,
  hasServiceLaneFlags,
  mergeServiceLaneSetup,
  removeStagedServiceFlag,
  serviceLaneAssignmentCount,
  serviceLaneBusCount,
  serviceLaneSetupIssues,
  setBringToCardsKind,
  setBringToCardsReason,
  stageCurrentServiceLane,
  type BringToCardsKind,
  type ServiceLaneChange,
  type ServiceLaneFlagId,
} from "../lib/serviceLaneSetup";
import type { FlagEntry, FlagMap } from "../lib/types";
import {
  Button,
  Pressable,
  ResponsiveDialog,
  TextField,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import {
  InspOptionPicker,
  ReasonPicker,
  TirePicker,
} from "./ManagerPanel";
import TypeCodes from "./TypeCodes";
import styles from "./SetupLane.module.css";

// Wizard steps. "bringcards" is one category covering both Hold and Cards:
// every one of those buses is brought to cards, and each is marked Hold or
// Card with a reason.
type StepId = "inspection" | "retorque" | "bringcards" | "review";

const STEPS: Array<{
  id: StepId;
  label: string;
  heading: string;
  description: string;
}> = [
  {
    id: "inspection",
    label: "Inspections",
    heading: "Add inspections",
    description: "Enter a bus, then choose the inspection object code and any follow up.",
  },
  {
    id: "retorque",
    label: "Retorques",
    heading: "Add retorques",
    description: "Enter a bus, then choose the tires that need retorque.",
  },
  {
    id: "bringcards",
    label: "Holds & Cards",
    heading: "Add buses to bring to cards",
    description: "Enter a bus, mark it Hold or Card, then add the reason.",
  },
  {
    id: "review",
    label: "Review",
    heading: "Review tonight's lane",
    description: "Nothing changes live until you apply this replacement.",
  },
];

const STEP_FLAGS: Record<Exclude<StepId, "review">, readonly ServiceLaneFlagId[]> = {
  inspection: ["inspection"],
  retorque: ["retorque"],
  bringcards: BRING_TO_CARDS_FLAGS,
};

const KIND_LABEL: Record<BringToCardsKind, string> = { hold: "Hold", cards: "Card" };

const CHANGE_GROUPS: Array<{ change: ServiceLaneChange; label: string }> = [
  { change: "add", label: "Adding" },
  { change: "change", label: "Changing" },
  { change: "drop", label: "Dropping" },
  { change: "keep", label: "Keeping as is" },
];

// Number groups pasted or typed together: "6414 6392, 6450" → ["6414","6392","6450"].
function splitBusNumbers(raw: string): string[] {
  return Array.from(new Set(raw.split(/[^0-9]+/).filter(Boolean)));
}

function entryFor(flags: FlagMap, bus: string): FlagEntry {
  return flags[bus] || emptyFlagEntry();
}

function hasStepFlag(entry: FlagEntry | undefined, step: Exclude<StepId, "review">): boolean {
  return !!entry && STEP_FLAGS[step].some((id) => entry.flags.includes(id));
}

function sortBuses(buses: string[]): string[] {
  return buses.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

interface SetupLaneProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  flags: FlagMap;
  onBusFlagsUpdated: (bus: string, entry: FlagEntry) => void;
  onApplyAndPrint?: (apply: () => Promise<void>) => Promise<void>;
}

export default function SetupLane({
  isOpen,
  onOpenChange,
  flags,
  onBusFlagsUpdated,
  onApplyAndPrint,
}: SetupLaneProps) {
  const { isKnown, label, master } = useBusMaster();
  // A typed number auto-adds only when it can't still grow into a different
  // bus (e.g. "2553" while 25538 exists) — otherwise Enter/Add commits it.
  const isAmbiguousPrefix = (bus: string) =>
    master.buses.some((b) => b.num.length > bus.length && b.num.startsWith(bus) && isKnown(b.num));
  const [stepIndex, setStepIndex] = useState(0);
  const [staged, setStaged] = useState<FlagMap>({});
  // Buses entered on the Holds & Cards step that have not been marked Hold or
  // Card yet. They stay in the list until a kind is picked, and are never
  // applied without one.
  const [undecided, setUndecided] = useState<string[]>([]);
  const [busInput, setBusInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  // How many buses the wizard started with (carried over from the live lane).
  const [seededCount, setSeededCount] = useState(0);
  const [pinnedBuses, setPinnedBuses] = useState<Partial<Record<StepId, string>>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      // The wizard replaces the lane sheets, so it opens blank: what is typed
      // here IS tonight's lane. Carrying over the live lane is one tap away
      // (carryOverLane) for the nights that really are last night's again.
      setStepIndex(0);
      setStaged({});
      setSeededCount(0);
      setUndecided([]);
      setBusInput("");
      setInputError("");
      setStatus("");
      setConfirmOpen(false);
      setPinnedBuses({});
    }
    wasOpen.current = isOpen;
    // `flags` is only read when the wizard opens; live updates while it is open
    // must not reset what the crew has staged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const step = STEPS[stepIndex];
  const currentStep = step.id === "review" ? null : step.id;

  const stagedRows = useMemo(() => {
    if (!currentStep) return [];
    const withFlag = Object.keys(staged).filter((bus) => hasStepFlag(staged[bus], currentStep));
    const rows = sortBuses(
      currentStep === "bringcards" ? Array.from(new Set([...undecided, ...withFlag])) : withFlag,
    );
    const pinned = pinnedBuses[currentStep];
    return pinned && rows.includes(pinned)
      ? [pinned, ...rows.filter((bus) => bus !== pinned)]
      : rows;
  }, [currentStep, pinnedBuses, staged, undecided]);

  function stepCount(id: StepId): number {
    if (id === "review") return serviceLaneAssignmentCount(staged);
    const withFlag = Object.keys(staged).filter((bus) => hasStepFlag(staged[bus], id)).length;
    return id === "bringcards" ? withFlag + undecided.length : withFlag;
  }

  const issues = useMemo(() => serviceLaneSetupIssues(staged), [staged]);
  const diff = useMemo(() => diffServiceLaneSetup(flags, staged), [flags, staged]);
  const changeCount = (change: ServiceLaneChange) => diff.filter((row) => row.change === change).length;
  const assignmentCount = serviceLaneAssignmentCount(staged);
  const stagedBusCount = serviceLaneBusCount(staged);
  const currentAssignmentCount = serviceLaneAssignmentCount(flags);
  const currentBusCount = serviceLaneBusCount(flags);
  const nothingStaged = Object.keys(staged).length === 0 && undecided.length === 0;

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function updateBus(bus: string, update: (entry: FlagEntry) => FlagEntry) {
    setStaged((current) => ({ ...current, [bus]: update(entryFor(current, bus)) }));
  }

  function addBus(raw = busInput) {
    if (!currentStep) return;
    const bus = sanitizeBus(raw);
    if (!bus || !isKnown(bus)) {
      setInputError("That bus is not in the active fleet list.");
      return;
    }
    setPinnedBuses((current) => ({ ...current, [currentStep]: bus }));
    if (currentStep === "bringcards") {
      // The bus waits at the top of the list until it is marked Hold or Card.
      if (!hasStepFlag(staged[bus], "bringcards")) {
        setUndecided((current) => (current.includes(bus) ? current : [...current, bus]));
      }
    } else {
      const flagId = STEP_FLAGS[currentStep][0];
      updateBus(bus, (entry) => addStagedServiceFlag(entry, flagId));
    }
    setBusInput("");
    setInputError("");
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
    focusInput();
  }

  // Several numbers at once (typed with spaces/commas or pasted from a text).
  // Known buses are added; the rest are reported and left in the field.
  function addMany(raw: string) {
    if (!currentStep) return;
    const tokens = splitBusNumbers(raw);
    if (!tokens.length) {
      setInputError("That bus is not in the active fleet list.");
      return;
    }
    const unknown = tokens.filter((token) => !isKnown(sanitizeBus(token)));
    for (const token of tokens) {
      const bus = sanitizeBus(token);
      if (isKnown(bus)) addBus(bus);
    }
    if (unknown.length) {
      setBusInput(unknown.join(" "));
      setInputError(`Not in the active fleet list: ${unknown.join(", ")}`);
    }
  }

  function startFresh() {
    setStaged({});
    setUndecided([]);
    setPinnedBuses({});
    setSeededCount(0);
    setStatus("");
    focusInput();
  }

  // Opt-in: stage every bus currently on the lane so the crew removes what is
  // done instead of retyping. Only offered while nothing has been typed yet.
  function carryOverLane() {
    const seed = stageCurrentServiceLane(flags);
    setStaged(seed);
    setUndecided([]);
    setPinnedBuses({});
    setSeededCount(Object.keys(seed).length);
    setStatus("");
    focusInput();
  }

  function withoutStepFlags(entry: FlagEntry, id: Exclude<StepId, "review">): FlagEntry {
    return STEP_FLAGS[id].reduce((next, flagId) => removeStagedServiceFlag(next, flagId), entry);
  }

  function removeBus(bus: string) {
    if (!currentStep) return;
    setStaged((current) => {
      const next = { ...current };
      const entry = withoutStepFlags(entryFor(next, bus), currentStep);
      if (hasServiceLaneFlags(entry)) next[bus] = entry;
      else delete next[bus];
      return next;
    });
    if (currentStep === "bringcards") {
      setUndecided((current) => current.filter((item) => item !== bus));
    }
    setPinnedBuses((current) => {
      if (current[currentStep] !== bus) return current;
      const next = { ...current };
      delete next[currentStep];
      return next;
    });
  }

  function clearCurrentStep() {
    if (!currentStep) return;
    setStaged((current) => {
      const next: FlagMap = {};
      for (const [bus, currentEntry] of Object.entries(current)) {
        const entry = withoutStepFlags(currentEntry, currentStep);
        if (hasServiceLaneFlags(entry)) next[bus] = entry;
      }
      return next;
    });
    if (currentStep === "bringcards") setUndecided([]);
    setPinnedBuses((current) => {
      const next = { ...current };
      delete next[currentStep];
      return next;
    });
    setStatus("");
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
  }

  function chooseKind(bus: string, kind: BringToCardsKind) {
    updateBus(bus, (entry) => setBringToCardsKind(entry, kind));
    setUndecided((current) => current.filter((item) => item !== bus));
  }

  function moveTo(nextIndex: number) {
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, nextIndex)));
    setBusInput("");
    setInputError("");
    setStatus("");
    focusInput();
  }

  async function replaceSetup() {
    try {
      const latestResponse = await fetch("/api/flags", { cache: "no-store" });
      if (!latestResponse.ok) throw new Error("Could not load the latest flags.");
      const latest = ((await latestResponse.json()) as { flags?: FlagMap }).flags || {};
      const buses = Array.from(
        new Set([
          ...Object.keys(latest).filter((bus) => hasServiceLaneFlags(latest[bus])),
          ...Object.keys(staged),
        ]),
      );
      let failed = 0;
      for (const bus of buses) {
        const next = mergeServiceLaneSetup(entryFor(latest, bus), staged[bus]);
        const response = await fetch("/api/flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bus,
            flags: next.flags,
            note: next.note,
            inspMiles: next.inspMiles ?? null,
            holdReason: next.holdReason,
            cardsReason: next.cardsReason,
            retorqueTires: next.retorqueTires,
            inspOption: next.inspOption,
            actor: getDeviceActor(),
          }),
        }).catch(() => null);
        if (!response?.ok) failed += 1;
        else onBusFlagsUpdated(bus, next);
      }

      if (failed > 0) {
        throw new Error(`${failed} bus update${failed === 1 ? "" : "s"} did not save. Review and apply again.`);
      }
      setConfirmOpen(false);
      onOpenChange(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Setup could not be applied.");
      throw error;
    }
  }

  async function applySetup() {
    if (applying) return;
    setApplying(true);
    setStatus("");
    try {
      if (onApplyAndPrint) await onApplyAndPrint(replaceSetup);
      else await replaceSetup();
    } catch {
      // replaceSetup reports actionable errors in the wizard. The print helper
      // closes its reserved tab instead of rendering a partial replacement.
    } finally {
      setApplying(false);
    }
  }

  const undecidedNote = undecided.length
    ? ` ${undecided.length} bus${undecided.length === 1 ? " was" : "es were"} never marked Hold or Card and will be left out.`
    : "";
  const issuesNote = issues.length
    ? ` ${issues.length} assignment${issues.length === 1 ? " has" : "s have"} optional details missing.`
    : "";
  const confirmSummary =
    `Adds ${changeCount("add")}, changes ${changeCount("change")}, drops ${changeCount("drop")}, keeps ${changeCount("keep")}. `
    + `Other maintenance flags and notes stay unchanged.${issuesNote}${undecidedNote}`;

  // The confirm step lives in the footer, so the review list stays on screen
  // while the crew decides.
  const footer = confirmOpen ? (
    <div className={`${styles.footerContent} ${styles.confirmBar}`} role="alertdialog" aria-label="Replace the current lane setup?">
      <span className={styles.confirmText}>
        <strong>Replace the current lane setup?</strong> {confirmSummary}
      </span>
      <div className={styles.footerActions}>
        <Button variant="quiet" onPress={() => setConfirmOpen(false)} isDisabled={applying}>
          Cancel
        </Button>
        <Button variant="primary" onPress={applySetup} isDisabled={applying}>
          <ClipboardCheck aria-hidden="true" /> {applying ? "Applying…" : "Replace setup"}
        </Button>
      </div>
    </div>
  ) : (
    <div className={styles.footerContent}>
      <span className={styles.footerSummary}>
        {step.id === "review"
          ? `${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"} on ${stagedBusCount} bus${stagedBusCount === 1 ? "" : "es"}`
          : `${stagedRows.length} added`}
      </span>
      <div className={styles.footerActions}>
        {stepIndex > 0 && (
          <Button variant="quiet" onPress={() => moveTo(stepIndex - 1)}>
            <ArrowLeft aria-hidden="true" /> Back
          </Button>
        )}
        {step.id === "review" ? (
          <Button
            variant="primary"
            onPress={() => setConfirmOpen(true)}
            isDisabled={applying}
          >
            <ClipboardCheck aria-hidden="true" /> Apply lane setup
          </Button>
        ) : (
          <Button variant="primary" onPress={() => moveTo(stepIndex + 1)}>
            Continue <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <ResponsiveDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onOpenChange(false);
        }}
        title="Setup Lane"
        description="Build tonight's printable service flags, then replace the old setup once."
        size="lg"
        scrollMode="contained"
        bodyClassName={styles.dialogBody}
        footer={footer}
      >
        <div className={styles.flow}>
          <nav className={styles.steps} aria-label="Setup Lane progress">
            {STEPS.map((item, index) => {
              const count = stepCount(item.id);
              return (
                <Pressable
                  key={item.id}
                  className={`${styles.step} ${index === stepIndex ? styles.stepCurrent : ""}`}
                  onPress={() => moveTo(index)}
                  aria-current={index === stepIndex ? "step" : undefined}
                  aria-label={item.label}
                >
                  <span>{item.label}</span>
                  {count > 0 && <span className={styles.stepCount} aria-hidden="true">{count}</span>}
                </Pressable>
              );
            })}
          </nav>

          <div ref={contentRef} className={styles.content} data-dialog-scroll-region="">
            <div className={styles.stepHeader}>
              <div>
                <h3>{step.heading}</h3>
                <p>{step.description}</p>
              </div>
              <div className={styles.stepHeaderActions}>
                <div className={styles.liveSummary}>
                  <strong>{currentAssignmentCount}</strong>
                  <span>current assignments on {currentBusCount} buses</span>
                </div>
                {currentStep && (
                  <Button
                    className={styles.clearStep}
                    variant="quiet"
                    size="sm"
                    isDisabled={stagedRows.length === 0}
                    onPress={clearCurrentStep}
                    aria-label={`Clear all ${step.label.toLowerCase()}`}
                  >
                    <Trash2 aria-hidden="true" /> Clear all
                  </Button>
                )}
              </div>
            </div>

            {currentStep ? (
              <>
                {seededCount > 0 ? (
                  <div className={styles.seedNote} role="note">
                    <span>
                      Started from tonight's lane — <strong>{seededCount}</strong> bus{seededCount === 1 ? "" : "es"} carried
                      over. Remove the ones that are done, add what's new.
                    </span>
                    <Pressable className={styles.seedReset} onPress={startFresh}>
                      <Eraser aria-hidden="true" /> Start from scratch
                    </Pressable>
                  </div>
                ) : nothingStaged && currentBusCount > 0 ? (
                  <div className={`${styles.seedNote} ${styles.seedOffer}`} role="note">
                    <span>
                      Blank sheet. Type tonight's lane below, or copy the <strong>{currentBusCount}</strong> bus
                      {currentBusCount === 1 ? "" : "es"} on the lane now and edit from there.
                    </span>
                    <Pressable className={styles.seedReset} onPress={carryOverLane}>
                      <History aria-hidden="true" /> Start from tonight's lane
                    </Pressable>
                  </div>
                ) : null}
                <div className={styles.addBus}>
                  <TextField
                    className={styles.busInput}
                    inputRef={inputRef}
                    label={`Add bus to ${step.label.toLowerCase()}`}
                    placeholder="Bus number — or paste several"
                    inputMode="numeric"
                    value={busInput}
                    errorMessage={inputError}
                    autoFocus
                    onChange={(value) => {
                      // A pasted list ("6414 6392 6450") adds every bus at once.
                      if (splitBusNumbers(value).length > 1) {
                        addMany(value);
                        return;
                      }
                      const bus = sanitizeBus(value);
                      setBusInput(bus);
                      setInputError("");
                      if (isKnown(bus) && !isAmbiguousPrefix(bus)) addBus(bus);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addMany(busInput);
                    }}
                  />
                  <Button
                    variant="primary"
                    onPress={() => addMany(busInput)}
                    isDisabled={!busInput.trim()}
                  >
                    <Plus aria-hidden="true" /> Add
                  </Button>
                </div>

                {stagedRows.length === 0 ? (
                  <div className={styles.emptyStep}>
                    <BusFront aria-hidden="true" />
                    <span>No buses added. Continue when this category is clear tonight.</span>
                  </div>
                ) : (
                  <div className={styles.busList}>
                    {stagedRows.map((bus) => {
                      const entry = entryFor(staged, bus);
                      const kind = currentStep === "bringcards" ? bringToCardsKind(entry) : null;
                      const onLaneNow = hasStepFlag(flags[bus], currentStep);
                      return (
                        <section className={styles.busRow} key={bus}>
                          <div className={styles.busRowHeader}>
                            <div className={styles.busIdentity}>
                              <strong>{label(bus)}</strong>
                              <TypeCodes num={bus} variant="ui" />
                              {(onLaneNow || seededCount > 0) && (
                                <span className={styles.rowBadge} data-tone={onLaneNow ? "current" : "new"}>
                                  {onLaneNow ? "on lane now" : "new"}
                                </span>
                              )}
                            </div>
                            <Pressable
                              className={styles.removeBus}
                              onPress={() => removeBus(bus)}
                              aria-label={`Remove bus ${label(bus)} from ${step.label}`}
                            >
                              <Trash2 aria-hidden="true" /> Remove
                            </Pressable>
                          </div>

                          {currentStep === "bringcards" && (
                            <>
                              <div
                                className={styles.kindChooser}
                                role="group"
                                aria-label={`Bus ${label(bus)} is a`}
                              >
                                {BRING_TO_CARDS_FLAGS.map((option) => (
                                  <Pressable
                                    key={option}
                                    className={`${styles.kindChip} ${kind === option ? styles.kindChipActive : ""}`}
                                    aria-pressed={kind === option}
                                    onPress={() => chooseKind(bus, option)}
                                  >
                                    {KIND_LABEL[option]}
                                  </Pressable>
                                ))}
                                {!kind && (
                                  <span className={styles.kindHint}>Choose Hold or Card</span>
                                )}
                              </div>
                              {kind && (
                                <ReasonPicker
                                  key={kind}
                                  kind={kind}
                                  variant="plain"
                                  reason={bringToCardsReason(entry)}
                                  onChange={(reason) => updateBus(bus, (current) => setBringToCardsReason(current, reason))}
                                />
                              )}
                            </>
                          )}
                          {currentStep === "inspection" && (
                            <InspOptionPicker
                              variant="plain"
                              option={entry.inspOption}
                              onChange={(option) => updateBus(bus, (current) => setInspectionOption(current, option))}
                              followUpActive={entry.flags.includes("followup")}
                              onFollowUpToggle={() => updateBus(bus, (current) => ({
                                ...current,
                                flags: current.flags.includes("followup")
                                  ? current.flags.filter((id) => id !== "followup")
                                  : [...current.flags, "followup"],
                              }))}
                            />
                          )}
                          {currentStep === "retorque" && (
                            <TirePicker
                              variant="plain"
                              tires={entry.retorqueTires}
                              onChange={(retorqueTires) => updateBus(bus, (current) => ({ ...current, retorqueTires }))}
                            />
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.review}>
                {diff.length === 0 ? (
                  <div className={styles.emptyReview}>
                    <ClipboardCheck aria-hidden="true" />
                    <div>
                      <strong>Nothing on the lane tonight</strong>
                      <p>No lane flags are set now and none are staged. Applying changes nothing.</p>
                    </div>
                  </div>
                ) : (
                  CHANGE_GROUPS.map(({ change, label: groupLabel }) => {
                    const rows = diff.filter((row) => row.change === change);
                    if (!rows.length) return null;
                    return (
                      <section className={styles.reviewGroup} key={change} data-change={change}>
                        <h4>{groupLabel}<span>{rows.length}</span></h4>
                        <div className={styles.reviewRows}>
                          {rows.map((row) => (
                            <div className={styles.reviewRow} key={row.bus}>
                              <strong>{label(row.bus)}</strong>
                              <span>
                                {row.change === "change" && (
                                  <s className={styles.diffBefore}>{describeServiceLaneEntry(row.before)}</s>
                                )}
                                {row.change === "drop"
                                  ? describeServiceLaneEntry(row.before)
                                  : describeServiceLaneEntry(row.after)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })
                )}

                {undecided.length > 0 && (
                  <div className={styles.issues} role="status">
                    <strong>Not marked Hold or Card</strong>
                    {sortBuses(undecided).map((bus) => (
                      <span key={bus}>{label(bus)} will be left out until you choose Hold or Card</span>
                    ))}
                  </div>
                )}
                {issues.length > 0 && (
                  <div className={styles.issues} role="status">
                    <strong>Optional details missing</strong>
                    {issues.map((issue) => <span key={issue}>{issue}</span>)}
                    <span>The inspection or retorque flag will still be applied.</span>
                  </div>
                )}
                {status && <div className={styles.errorStatus} role="alert">{status}</div>}
              </div>
            )}
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
