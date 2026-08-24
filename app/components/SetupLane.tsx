"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  ClipboardCheck,
  Plus,
  Trash2,
} from "lucide-react";
import { sanitizeBus } from "../lib/buses";
import { getDeviceActor } from "../lib/deviceActor";
import {
  inspectionOptionFromText,
  retorqueTiresDisplay,
  setInspectionOption,
} from "../lib/grid";
import {
  addStagedServiceFlag,
  emptyFlagEntry,
  hasServiceLaneFlags,
  mergeServiceLaneSetup,
  removeStagedServiceFlag,
  serviceLaneAssignmentCount,
  serviceLaneBusCount,
  serviceLaneSetupIssues,
  type ServiceLaneFlagId,
} from "../lib/serviceLaneSetup";
import type { FlagEntry, FlagMap } from "../lib/types";
import {
  Button,
  ConfirmDialog,
  Pressable,
  ResponsiveDialog,
  TextField,
} from "../ui";
import { useBusMaster } from "./BusMasterProvider";
import {
  HoldReasonPicker,
  InspOptionPicker,
  TirePicker,
} from "./ManagerPanel";
import TypeCodes from "./TypeCodes";
import styles from "./SetupLane.module.css";

const STEPS: Array<{
  id: ServiceLaneFlagId | "review";
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
    id: "hold",
    label: "Holds",
    heading: "Add tonight's holds",
    description: "Enter each held bus. Add a reason when it helps the lane team.",
  },
  {
    id: "braketest",
    label: "Brake tests",
    heading: "Add brake tests",
    description: "Enter every bus that needs a brake test tonight.",
  },
  {
    id: "cards",
    label: "Cards",
    heading: "Add card buses",
    description: "Enter every bus that needs cards on the service lane.",
  },
  {
    id: "review",
    label: "Review",
    heading: "Review tonight's lane",
    description: "Nothing changes live until you apply this replacement.",
  },
];

function entryFor(flags: FlagMap, bus: string): FlagEntry {
  return flags[bus] || emptyFlagEntry();
}

function stepCount(flags: FlagMap, id: ServiceLaneFlagId | "review"): number {
  if (id === "review") return serviceLaneAssignmentCount(flags);
  return Object.values(flags).filter((entry) => entry.flags.includes(id)).length;
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
  const { isKnown, label } = useBusMaster();
  const [stepIndex, setStepIndex] = useState(0);
  const [staged, setStaged] = useState<FlagMap>({});
  const [busInput, setBusInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pinnedBuses, setPinnedBuses] = useState<Partial<Record<ServiceLaneFlagId, string>>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setStepIndex(0);
      setStaged({});
      setBusInput("");
      setInputError("");
      setStatus("");
      setConfirmOpen(false);
      setPinnedBuses({});
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const step = STEPS[stepIndex];
  const currentFlag = step.id === "review" ? null : step.id;
  const stagedRows = useMemo(() => {
    if (!currentFlag) return [];
    const rows = Object.keys(staged)
      .filter((bus) => staged[bus].flags.includes(currentFlag))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const pinned = pinnedBuses[currentFlag];
    return pinned && rows.includes(pinned)
      ? [pinned, ...rows.filter((bus) => bus !== pinned)]
      : rows;
  }, [currentFlag, pinnedBuses, staged]);
  const issues = useMemo(() => serviceLaneSetupIssues(staged), [staged]);
  const assignmentCount = serviceLaneAssignmentCount(staged);
  const stagedBusCount = serviceLaneBusCount(staged);
  const currentAssignmentCount = serviceLaneAssignmentCount(flags);
  const currentBusCount = serviceLaneBusCount(flags);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function updateBus(bus: string, update: (entry: FlagEntry) => FlagEntry) {
    setStaged((current) => ({ ...current, [bus]: update(entryFor(current, bus)) }));
  }

  function addBus(raw = busInput) {
    if (!currentFlag) return;
    const bus = sanitizeBus(raw);
    if (!bus || !isKnown(bus)) {
      setInputError("That bus is not in the active fleet list.");
      return;
    }
    setPinnedBuses((current) => ({ ...current, [currentFlag]: bus }));
    updateBus(bus, (entry) => addStagedServiceFlag(entry, currentFlag));
    setBusInput("");
    setInputError("");
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
    focusInput();
  }

  function removeBus(bus: string) {
    if (!currentFlag) return;
    setStaged((current) => {
      const next = { ...current };
      const entry = removeStagedServiceFlag(entryFor(next, bus), currentFlag);
      if (hasServiceLaneFlags(entry)) next[bus] = entry;
      else delete next[bus];
      return next;
    });
    setPinnedBuses((current) => {
      if (current[currentFlag] !== bus) return current;
      const next = { ...current };
      delete next[currentFlag];
      return next;
    });
  }

  function clearCurrentStep() {
    if (!currentFlag) return;
    setStaged((current) => {
      const next: FlagMap = {};
      for (const [bus, currentEntry] of Object.entries(current)) {
        const entry = removeStagedServiceFlag(currentEntry, currentFlag);
        if (hasServiceLaneFlags(entry)) next[bus] = entry;
      }
      return next;
    });
    setPinnedBuses((current) => {
      const next = { ...current };
      delete next[currentFlag];
      return next;
    });
    setStatus("");
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
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

  const footer = (
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
        isOpen={isOpen && !confirmOpen}
        onOpenChange={(open) => {
          if (!open && !confirmOpen) onOpenChange(false);
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
              const count = stepCount(staged, item.id);
              return (
                <Pressable
                  key={item.id}
                  className={`${styles.step} ${index === stepIndex ? styles.stepCurrent : ""}`}
                  onPress={() => moveTo(index)}
                  aria-current={index === stepIndex ? "step" : undefined}
                >
                  <span>{item.label}</span>
                  {count > 0 && <span className={styles.stepCount}>{count}</span>}
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
                {currentFlag && (
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

            {currentFlag ? (
              <>
                <div className={styles.addBus}>
                  <TextField
                    className={styles.busInput}
                    inputRef={inputRef}
                    label={`Add bus to ${step.label.toLowerCase()}`}
                    placeholder="Bus number"
                    inputMode="numeric"
                    value={busInput}
                    errorMessage={inputError}
                    autoFocus
                    onChange={(value) => {
                      const bus = sanitizeBus(value);
                      setBusInput(bus);
                      setInputError("");
                      if (isKnown(bus)) addBus(bus);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addBus();
                    }}
                  />
                  <Button
                    variant="primary"
                    onPress={() => addBus()}
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
                      return (
                        <section className={styles.busRow} key={bus}>
                          <div className={styles.busRowHeader}>
                            <div className={styles.busIdentity}>
                              <strong>{label(bus)}</strong>
                              <TypeCodes num={bus} variant="ui" />
                            </div>
                            <Pressable
                              className={styles.removeBus}
                              onPress={() => removeBus(bus)}
                              aria-label={`Remove bus ${label(bus)} from ${step.label}`}
                            >
                              <Trash2 aria-hidden="true" /> Remove
                            </Pressable>
                          </div>

                          {currentFlag === "hold" && (
                            <HoldReasonPicker
                              variant="plain"
                              reason={entry.holdReason}
                              onChange={(holdReason) => updateBus(bus, (current) => ({ ...current, holdReason }))}
                            />
                          )}
                          {currentFlag === "inspection" && (
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
                          {currentFlag === "retorque" && (
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
                {assignmentCount === 0 ? (
                  <div className={styles.emptyReview}>
                    <ClipboardCheck aria-hidden="true" />
                    <div>
                      <strong>Clear tonight's service flags</strong>
                      <p>Applying this empty setup removes the current printable lane flags and preserves every unrelated flag and note.</p>
                    </div>
                  </div>
                ) : (
                  STEPS.slice(0, -1).map((item) => {
                    const rows = Object.keys(staged)
                      .filter((bus) => staged[bus].flags.includes(item.id))
                      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                    if (!rows.length) return null;
                    return (
                      <section className={styles.reviewGroup} key={item.id}>
                        <h4>{item.label}<span>{rows.length}</span></h4>
                        <div className={styles.reviewRows}>
                          {rows.map((bus) => {
                            const entry = staged[bus];
                            let detail = "";
                            if (item.id === "hold") detail = entry.holdReason || "No reason";
                            if (item.id === "inspection") {
                              detail = inspectionOptionFromText(entry.inspOption)?.label || "Choose type";
                              if (entry.flags.includes("followup")) detail += " · Follow up";
                            }
                            if (item.id === "retorque") detail = retorqueTiresDisplay(entry.retorqueTires) || "Choose tires";
                            return (
                              <div className={styles.reviewRow} key={bus}>
                                <strong>{label(bus)}</strong>
                                {detail && <span>{detail}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })
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

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace the current lane setup?"
        description={`This removes the existing printable service flags from ${currentBusCount} bus${currentBusCount === 1 ? "" : "es"}, then applies ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"}. Other maintenance flags and notes stay unchanged.${issues.length ? ` ${issues.length} assignment${issues.length === 1 ? " has" : "s have"} optional details missing.` : ""}`}
        confirmLabel="Replace setup"
        isPending={applying}
        onConfirm={applySetup}
      />
    </>
  );
}
