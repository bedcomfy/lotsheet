import { beforeEach, describe, expect, it } from "vitest";
import { claimMileageSync, finishMileageSync, getMileageSyncStatus, MILEAGE_SYNC_KEY } from "./pmMileageSyncStore";
import { getFlags, getPmMileage, listPmMileageLog, setBusFlags, setState, updatePmMileage } from "./store";
import type { OdometerReportParse, OdometerReportRow } from "./odometerReport";

function reading(bus: string, odometer: number, notServiced = false): OdometerReportRow {
  return { bus, odometer, notServiced, division: "0043", dept: null, mpg: 5, milesRun: 20, page: 1 };
}
function result(rows: OdometerReportRow[]) {
  return { report: { rows, reportDate: "9/30/26", lineCount: rows.length } satisfies OdometerReportParse,
    windowStart: "09/29/2026 04:55 AM", windowEnd: "09/30/2026 04:55 AM" };
}
async function start() {
  const claim = await claimMileageSync();
  if (!claim.claimed) throw new Error("Expected lease");
  return claim.token;
}

describe("automatic mileage writes (in-memory Postgres)", { timeout: 20_000 }, () => {
  beforeEach(async () => {
    await setState(MILEAGE_SYNC_KEY, {});
    await setState("bus_master", { buses: [
      { num: "6404", status: "active" }, { num: "6435", status: "active" }, { num: "6500", status: "retired" },
    ] });
  });

  it("changes only odometer fields, preserves both notes and both schedules, and avoids duplicate history", async () => {
    await updatePmMileage("6404", { odometer: 100000, odometerDate: "9/29/26", nextInspType: "A-3", nextInspMiles: 100025,
      nextTransMiles: 100250, lastInspType: "C-24", lastInspMiles: 97000, disposition: "shop", note: "PM note" });
    await setBusFlags("6404", { flags: ["hold"], note: "Flag note", holdReason: "Parts" });
    const before = (await getPmMileage())["6404"];
    const flags = await getFlags();
    const status = await finishMileageSync(await start(), result([reading("6404", 100030), reading("6435", 80000, true), reading("6500", 90000), reading("9999", 10000)]));
    expect(status.updated).toBe(2);
    expect(status.skipped).toHaveLength(2);
    const after = (await getPmMileage())["6404"];
    expect(after).toMatchObject({ ...before, odometer: 100030, odometerDate: "9/30/26", source: "Fleetwatch · Division 0043", updatedAt: after.updatedAt });
    expect((await getPmMileage())["6435"].odometerDate).toBeNull();
    expect(await getFlags()).toEqual(flags);
    const log = await listPmMileageLog("6404");
    await setState(MILEAGE_SYNC_KEY, {});
    const repeat = await finishMileageSync(await start(), result([reading("6404", 100030)]));
    expect(repeat).toMatchObject({ updated: 0, unchanged: 1 });
    expect(await listPmMileageLog("6404")).toEqual(log);
  });

  it("allows only one lease and recovers an interrupted run without accepting its late response", async () => {
    const claims = await Promise.all([claimMileageSync(), claimMileageSync()]);
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    const first = claims.find((claim) => claim.claimed)!;
    expect(await getMileageSyncStatus()).not.toHaveProperty("token");
    await setState(MILEAGE_SYNC_KEY, { token: first.token, runningUntil: new Date(Date.now() - 1).toISOString(), startedAt: new Date(Date.now() - 240000).toISOString() });
    const next = await start();
    await expect(finishMileageSync(first.token!, result([reading("6404", 110000)]))).rejects.toThrow("expired");
    await finishMileageSync(next, { error: "Fleetwatch unavailable" });
    expect((await claimMileageSync()).claimed).toBe(false);
  });

  it("skips lower mileage, excessive jumps, and edits that happened during the download", async () => {
    await updatePmMileage("6404", { odometer: 100000 });
    await updatePmMileage("6435", { odometer: 100000 });
    const first = await finishMileageSync(await start(), result([reading("6404", 99999), reading("6435", 150001)]));
    expect(first.updated).toBe(0);
    expect(first.skipped?.map((row) => row.reason)).toEqual(["Below saved mileage", "Increase exceeds 50,000 miles; review PDF"]);
    await setState(MILEAGE_SYNC_KEY, {});
    const token = await start();
    await updatePmMileage("6404", { odometer: 90000, note: "Corrected while fetching" });
    const conflict = await finishMileageSync(token, result([reading("6404", 100030)]));
    expect(conflict.updated).toBe(0);
    expect((await getPmMileage())["6404"]).toMatchObject({ odometer: 90000, note: "Corrected while fetching" });
  });

  it("keeps last successful check and saved mileage on failure", async () => {
    await setState(MILEAGE_SYNC_KEY, { lastSuccessAt: "2026-09-29T12:00:00.000Z", updated: 12 });
    const before = await getPmMileage();
    const failed = await finishMileageSync(await start(), { error: "Fleetwatch returned HTML" });
    expect(failed).toMatchObject({ error: "Fleetwatch returned HTML", lastSuccessAt: "2026-09-29T12:00:00.000Z", updated: 12, runningUntil: null });
    expect(await getPmMileage()).toEqual(before);
  });
});

