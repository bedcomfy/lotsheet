// Switch for the automatic Fleetwatch mileage update. Off unless the
// FLEETWATCH_AUTO_SYNC environment variable is exactly "on". While off, the
// sync route refuses, the site gate stops exempting it, and PM Mileage hides
// "Update mileage now" and the check status; mileage comes from Import PDF.
// Everything behind the switch stays in place. Re-enabling is described in
// docs/fleetwatch-mileage.md. Kept dependency-free because proxy.ts reads it.
export function fleetwatchAutoSyncEnabled(): boolean {
  return (process.env.FLEETWATCH_AUTO_SYNC || "").trim().toLowerCase() === "on";
}
