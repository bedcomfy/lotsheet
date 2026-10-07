// Runs once per server start (Next.js instrumentation hook). Applies the
// committed master PM schedule snapshot if this deploy carries one that has
// not run yet; see app/lib/masterSchedule.ts. Skipped in tests (in-memory
// database) and in the edge runtime.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.PGLITE_DATA === "memory") return;
  try {
    const { applyMasterScheduleOnce } = await import("./app/lib/masterSchedule");
    const { ran, result } = await applyMasterScheduleOnce();
    if (ran && result) {
      console.log(`[master-schedule] applied ${result.id}: ${result.applied.length} buses updated, ${result.autoCompleted} PMs auto-completed, ${result.rejected.length} rows skipped`);
      for (const row of result.rejected) console.log(`[master-schedule] skipped bus ${row.bus}: ${row.reason}`);
      if (result.missingFromMaster.length) console.log(`[master-schedule] active buses not in the master: ${result.missingFromMaster.join(", ")}`);
    } else if (result) {
      console.log(`[master-schedule] ${result.id} already applied at ${result.appliedAt}`);
    } else {
      console.log("[master-schedule] another server instance is applying the snapshot");
    }
  } catch (err) {
    console.error("[master-schedule] failed:", err instanceof Error ? err.message : err);
  }
}
