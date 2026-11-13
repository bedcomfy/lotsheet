/** Serialized into the saved favorite. Keep this function self-contained. */
export function startFusionBridge(config) {
  if (location.origin !== config.fusionOrigin) {
    alert("Open your signed-in Oracle Fusion tab, then click Connect Lotsheet.");
    return;
  }
  const channel = crypto.randomUUID();
  const peer = window.open(config.appOrigin + "/fusion#fusion=" + channel, "_blank");
  if (!peer) { alert("Lotsheet could not open. The connection has not started."); return; }
  window.__lotsheetFusionConnection?.stop();
  let active = true, started = false, token = "";
  const controllers = new Set();
  const send = message => {
    if (active && !peer.closed) peer.postMessage({ protocol: config.protocol, channel, ...message }, config.appOrigin);
  };
  const stop = () => {
    if (!active) return;
    active = false;
    token = "";
    controllers.forEach(controller => controller.abort());
    window.removeEventListener("message", receive);
    window.removeEventListener("pagehide", stop);
    clearInterval(watch);
    clearTimeout(deadline);
    if (window.__lotsheetFusionConnection?.stop === stop) delete window.__lotsheetFusionConnection;
  };
  const get = async (path, headers = {}) => {
    if (!active) throw new Error("CLOSED");
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(path, { method: "GET", credentials: "same-origin",
        cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...headers } });
      if (!response.ok) throw new Error("AUTH");
      const body = await response.json();
      if (!active) throw new Error("CLOSED");
      return body;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  };
  async function authorize() {
    try {
      const csrf = await get("/fscmRestApi/anticsrf");
      if (typeof csrf.xsrftoken !== "string" || !csrf.xsrftoken) throw new Error("AUTH");
      const auth = await get("/fscmRestApi/tokenrelay", { "X-XSRF-TOKEN": csrf.xsrftoken });
      if (typeof auth.access_token !== "string" || !auth.access_token || auth.access_token.length > 3500) throw new Error("AUTH");
      if (!active) return;
      token = auth.access_token;
      send({ type: "authorization", accessToken: token });
    } catch {
      send({ type: "error" });
      stop();
    }
  }
  function receive(event) {
    const message = event.data;
    if (!active || event.source !== peer || event.origin !== config.appOrigin ||
        !message || message.protocol !== config.protocol || message.channel !== channel) return;
    if (message.type === "complete" || message.type === "cancel") { stop(); return; }
    if (message.type !== "hello") return;
    if (token) send({ type: "authorization", accessToken: token });
    else if (!started) { started = true; void authorize(); }
  }
  const watch = setInterval(() => { if (peer.closed) stop(); }, 5000);
  const deadline = setTimeout(stop, 600000);
  window.__lotsheetFusionConnection = { stop };
  window.addEventListener("message", receive);
  window.addEventListener("pagehide", stop);
}
