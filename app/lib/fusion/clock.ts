/** Calibrate the browser clock from the response timestamp, never from JWT contents. */
let serverOffset = 0;
export function synchronizeFusionClock(timestamp: string | null) {
  serverOffset = timestamp && /^\d{13}$/.test(timestamp) ? Number(timestamp) - Date.now() : 0;
}
export function fusionNow() { return Date.now() + serverOffset; }
export function remainingAccessSeconds(expiresAt: number, now = fusionNow()) {
  return Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
}
export function formatAccessRemaining(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(value => String(value).padStart(2, "0")).join(":");
}
