// One-shot apply of the shop's master tracker to the site's PM schedule.
//
// The shop keeps the PM schedule in its "PNW DAILY P.M. TRACKER" workbook. A
// snapshot of that workbook's schedule (next inspection type and due mark,
// plus the trans, front hub and differential PM marks) is committed in
// masterSchedule.data.ts. On the first server start after a deploy that
// carries a new snapshot, applyMasterScheduleOnce runs it through the same
// review and apply path as Import PDF with the workbook attached: odometers
// stay as they are on the site, marks that moved forward show up on the
// Completed page as auto-completed by the master upload. The snapshot id is
// stored in app_state so it never applies twice.
import { DEFAULT_MASTER, normalizeBusMaster } from "./buses";
import { MASTER_UPLOAD_ACTOR } from "./pmHistory";
import { reviewReadings } from "./pmMileage";
import { trackerScheduleReadings, type TrackerScheduleRow } from "./pmTracker";
import { MASTER_SCHEDULE_ID, MASTER_SCHEDULE_ROWS, type MasterScheduleRow } from "./masterSchedule.data";
import { applyPmReadings, claimState, getPmMileage, getState, recordAuditEvent, setState } from "./store";
import type { BusMaster } from "./types";

export const MASTER_SCHEDULE_KEY = "pm_master_schedule";
export { MASTER_SCHEDULE_ID };

export interface MasterScheduleResult {
  id: string;
  appliedAt: string;
  applied: string[];
  rejected: Array<{ bus: string; reason: string }>;
  autoCompleted: number;
  missingFromMaster: string[];
}

// What app_state holds under MASTER_SCHEDULE_KEY: a claim while a server
// instance applies the snapshot, then the result (or the failure, so the next
// start retries).
export type MasterScheduleState =
  | { id: string; status: "running"; startedAt: string }
  | { id: string; status: "failed"; startedAt: string; error: string }
  | ({ status: "done" } & MasterScheduleResult);

// A claim older than this is treated as abandoned (the instance died mid-run).
const STALE_CLAIM_MS = 15 * 60 * 1000;

export function masterScheduleRows(rows: readonly MasterScheduleRow[] = MASTER_SCHEDULE_ROWS): TrackerScheduleRow[] {
  return rows.map(([bus, nextInspType, nextInspDue, transDue, hubDue, diffDue]) => ({
    bus, nextInspType, nextInspDue, transDue, hubDue, diffDue, note: null,
  }));
}

// Applies the snapshot once: the stored result comes back when it already
// ran, another instance's fresh claim yields nothing, a failed or abandoned
// run is retried. Safe to call from every server start.
export async function applyMasterScheduleOnce(
  rows: readonly MasterScheduleRow[] = MASTER_SCHEDULE_ROWS,
  id: string = MASTER_SCHEDULE_ID,
): Promise<{ ran: boolean; result: MasterScheduleResult | null }> {
  const stored = (await getState(MASTER_SCHEDULE_KEY)).value as MasterScheduleState | null;
  const claim: MasterScheduleState = { id, status: "running", startedAt: new Date().toISOString() };
  if (stored && stored.id === id) {
    if (stored.status === "done") {
      const { status: _status, ...result } = stored;
      return { ran: false, result };
    }
    if (stored.status === "running" && Date.now() - Date.parse(stored.startedAt) < STALE_CLAIM_MS) return { ran: false, result: null };
    await setState(MASTER_SCHEDULE_KEY, claim); // failed or abandoned: take it over
  } else if (stored) {
    await setState(MASTER_SCHEDULE_KEY, claim); // an older snapshot ran before
  } else if (!(await claimState(MASTER_SCHEDULE_KEY, claim))) {
    return { ran: false, result: null };
  }

  try {
    const master = await getState("bus_master");
    const masterValue = master.value as { buses?: unknown } | null;
    const fleet = normalizeBusMaster(
      masterValue && Array.isArray(masterValue.buses) ? (masterValue as BusMaster) : DEFAULT_MASTER,
    ).buses;
    const review = reviewReadings(trackerScheduleReadings(masterScheduleRows(rows)), fleet, await getPmMileage());
    const outcome = await applyPmReadings(review.accepted, "master", MASTER_UPLOAD_ACTOR);
    const listed = new Set(rows.map((row) => row[0]));
    const result: MasterScheduleResult = {
      id,
      appliedAt: new Date().toISOString(),
      applied: outcome.applied,
      rejected: review.rejected.map((row) => ({ bus: row.bus, reason: row.reason })),
      autoCompleted: outcome.autoCompleted,
      missingFromMaster: fleet.filter((bus) => bus.status !== "retired" && !listed.has(bus.num)).map((bus) => bus.num)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
    await setState(MASTER_SCHEDULE_KEY, { status: "done", ...result } satisfies MasterScheduleState);
    await recordAuditEvent("pm_master_schedule", { id, applied: result.applied.length, rejected: result.rejected, autoCompleted: result.autoCompleted }, MASTER_UPLOAD_ACTOR);
    return { ran: true, result };
  } catch (err) {
    await setState(MASTER_SCHEDULE_KEY, { ...claim, status: "failed", error: err instanceof Error ? err.message : String(err) } satisfies MasterScheduleState);
    throw err;
  }
}
