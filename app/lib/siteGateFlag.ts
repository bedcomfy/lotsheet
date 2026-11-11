// Keep the typing game and session code available, but leave the site open by
// default. Set SITE_GATE_ENABLED=on and redeploy to restore the password gate.
// Read only on the server; RootLayout passes the same switch to the browser.
export function siteGateEnabled(): boolean {
  return (process.env.SITE_GATE_ENABLED || "").trim().toLowerCase() === "on";
}
