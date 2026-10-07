import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { appState, pmMileage, pmMileageLog } from "./db/schema";
import { DEFAULT_MASTER, normalizeBusMaster } from "./buses";
import type { MasterBus } from "./types";
import { FLEETWATCH_SOURCE, type MileageSyncStatus } from "./fleetwatch";
import type { OdometerReportParse } from "./odometerReport";
import type { VehicleServiceReading } from "./vehicleServiceReport";
import { isPmFleetBus } from "./pmMileage";

export const MILEAGE_SYNC_KEY = "pm_mileage_fleetwatch_sync";
interface StoredSync extends MileageSyncStatus { token?: string }

function publicStatus(value: unknown): MileageSyncStatus {
  const { token: _token, ...status } = (value || {}) as StoredSync;
  return status;
}

export async function getMileageSyncStatus(): Promise<MileageSyncStatus> {
  const db = await getDb();
  const [row] = await db.select().from(appState).where(eq(appState.key, MILEAGE_SYNC_KEY));
  return publicStatus(row?.value);
}

// A persisted lease works across serverless instances. Never keep a database
// transaction open while downloading the report; an interrupted run expires.
export async function claimMileageSync(now = new Date()) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.insert(appState).values({ key: MILEAGE_SYNC_KEY, value: {} }).onConflictDoNothing();
    const [row] = await tx.select().from(appState).where(eq(appState.key, MILEAGE_SYNC_KEY)).for("update");
    const old = (row.value || {}) as StoredSync;
    const running = old.runningUntil && Date.parse(old.runningUntil) > now.getTime();
    const cooling = old.startedAt && now.getTime() - Date.parse(old.startedAt) < 60_000;
    if (running || cooling) return { claimed: false as const, status: publicStatus(old), running: Boolean(running) };
    const token = randomUUID();
    const next: StoredSync = { ...old, token, startedAt: now.toISOString(), runningUntil: new Date(now.getTime() + 180_000).toISOString(), error: null };
    await tx.update(appState).set({ value: next, updatedAt: sql`now()` }).where(eq(appState.key, MILEAGE_SYNC_KEY));
    return { claimed: true as const, token, status: publicStatus(next) };
  });
}

export async function finishMileageSync(
  token: string,
  result: { report: OdometerReportParse; services?: VehicleServiceReading[]; serviceError?: string | null; windowStart: string; windowEnd: string; actor?: string } | { error: string },
): Promise<MileageSyncStatus> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(appState).where(eq(appState.key, MILEAGE_SYNC_KEY)).for("update");
    const old = (row?.value || {}) as StoredSync;
    if (old.token !== token || !old.runningUntil || Date.parse(old.runningUntil) <= Date.now()) {
      throw new Error("The mileage update expired. Please try again.");
    }
    const finishedAt = new Date().toISOString();
    const next: StoredSync = { ...old, token: undefined, runningUntil: null, finishedAt };
    if ("error" in result) {
      next.error = result.error;
    } else {
      const [master] = await tx.select().from(appState).where(eq(appState.key, "bus_master"));
      const value = master?.value as { buses?: MasterBus[] } | null;
      const fleet = normalizeBusMaster(value && Array.isArray(value.buses) ? { buses: value.buses } : DEFAULT_MASTER).buses;
      const active = new Set(fleet.filter(isPmFleetBus).map((bus) => bus.num));
      const before = new Map((await tx.select().from(pmMileage)).map((record) => [record.bus, record]));
      let updated = 0;
      let unchanged = 0;
      const skipped: NonNullable<MileageSyncStatus["skipped"]> = [];
      for (const reading of result.report.rows) {
        const previous = before.get(reading.bus);
        const miles = reading.odometer;
        if (!active.has(reading.bus)) { skipped.push({ bus: reading.bus, reason: "Not in the active fleet" }); continue; }
        if (!Number.isFinite(miles) || miles <= 0 || miles > 2_147_483_647) { skipped.push({ bus: reading.bus, reason: "No usable odometer" }); continue; }
        if (previous?.odometer === miles) { unchanged += 1; continue; }
        // Starred readings have no service date in this report. Do not label
        // them as a reading taken today; last checked is shown separately.
        const readAt = reading.notServiced ? null : (reading.readAt ?? result.report.reportDate);
        const set = { odometer: miles, odometerDate: readAt, source: FLEETWATCH_SOURCE, updatedAt: sql`now()` };
        // Mileage never goes backwards, except by less than a mile: a reading
        // saved as a whole number (425,482) comes back from the report with its
        // tenth (425,481.5), and that is the same reading, not a rollback.
        const saved = await tx.insert(pmMileage).values({ bus: reading.bus, ...set }).onConflictDoUpdate({
          target: pmMileage.bus,
          set,
          setWhere: sql`(${pmMileage.odometer} IS NULL OR (${pmMileage.odometer} - ${miles} < 1 AND ${miles} - ${pmMileage.odometer} <= 50000))
            AND (${pmMileage.updatedAt} IS NULL OR ${pmMileage.updatedAt} <= ${old.startedAt}::timestamptz)`,
        }).returning({ bus: pmMileage.bus });
        if (!saved.length) {
          const reason = previous?.odometer != null && miles < previous.odometer ? "Below saved mileage"
            : previous?.odometer != null && miles - previous.odometer > 50_000 ? "Increase exceeds 50,000 miles; review PDF"
            : "Bus changed during update; kept newer edit";
          skipped.push({ bus: reading.bus, reason });
          continue;
        }
        await tx.insert(pmMileageLog).values({ bus: reading.bus, odometer: miles, readAt, source: FLEETWATCH_SOURCE, batch: token, actor: result.actor || "Fleetwatch sync" });
        updated += 1;
      }
      let serviceUpdated = 0;
      const reportMileage = new Map(result.report.rows.map((reading) => [reading.bus, reading.odometer]));
      for (const service of result.services || []) {
        if (!active.has(service.bus)) continue;
        // The reports can be generated on opposite sides of a fueling event.
        // Keep the previous timestamp rather than associate a time with the
        // wrong odometer; the next update will reconcile the two reports.
        if (reportMileage.get(service.bus) !== service.odometer) {
          skipped.push({ bus: service.bus, reason: "Service odometer differs from mileage report; service time kept" });
          continue;
        }
        const previous = before.get(service.bus);
        if (previous?.lastServiceAt && previous.lastServiceAt >= service.servicedAt) continue;
        const saved = await tx.update(pmMileage).set({ lastServiceAt: service.servicedAt, lastServiceMiles: service.odometer, updatedAt: sql`now()` })
          .where(sql`${pmMileage.bus} = ${service.bus} AND ${pmMileage.odometer} = ${service.odometer}
            AND (${pmMileage.lastServiceAt} IS NULL OR ${pmMileage.lastServiceAt} < ${service.servicedAt})`)
          .returning({ bus: pmMileage.bus });
        if (saved.length) serviceUpdated += 1;
        else skipped.push({ bus: service.bus, reason: "Service time did not match saved mileage; kept previous service" });
      }
      Object.assign(next, { lastSuccessAt: finishedAt, windowStart: result.windowStart, windowEnd: result.windowEnd, updated, unchanged, serviceUpdated, serviceError: result.serviceError || null, skipped, error: null });
      if (updated || serviceUpdated) {
        await tx.execute(sql`INSERT INTO ${appState} (key, value, updated_at) VALUES ('__pulse', to_jsonb(1), now())
          ON CONFLICT (key) DO UPDATE SET value = to_jsonb(COALESCE((${appState}.value #>> '{}')::bigint, 0) + 1), updated_at = now()`);
      }
    }
    await tx.update(appState).set({ value: next, updatedAt: sql`now()` }).where(eq(appState.key, MILEAGE_SYNC_KEY));
    return publicStatus(next);
  });
}
