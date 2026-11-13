/**
 * Serialized into the user-saved favorite. Keep this function self-contained:
 * no imports, external scripts, persistent credentials, or arbitrary API paths.
 * Its serialized form is also exercised in the browser connection tests.
 */
export function startFusionBridge(config) {
  if (location.origin !== config.fusionOrigin) {
    alert("Open your signed-in Oracle Fusion tab, then click Connect Lotsheet.");
    return;
  }
  const channel = crypto.randomUUID();
  const peer = window.open(config.appOrigin + "/fusion#fusion=" + channel, "_blank");
  if (!peer) {
    alert("Lotsheet could not open. The connection has not started.");
    return;
  }
  window.__lotsheetFusionConnection?.stop();
  let active = true, busy = false, connected = false, token = "", expiresAt = 0;
  const controllers = new Set();
  const seen = new Set();
  const send = message => {
    if (active && !peer.closed) {
      peer.postMessage({ protocol: config.protocol, channel, ...message }, config.appOrigin);
    }
  };
  const stop = () => {
    if (!active) return;
    send({ type: "closed" });
    active = false;
    token = "";
    expiresAt = 0;
    controllers.forEach(controller => controller.abort());
    window.removeEventListener("message", receive);
    window.removeEventListener("pagehide", stop);
    clearInterval(watch);
    clearTimeout(startup);
    if (window.__lotsheetFusionConnection?.stop === stop) {
      delete window.__lotsheetFusionConnection;
    }
  };
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const get = async (path, options = {}) => {
    if (!active) throw fail("CLOSED", "Connection closed.");
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(path, {
        credentials: "same-origin", ...options,
        method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...options.headers },
      });
      if (response.status === 401) throw fail("AUTH", "Sign into Fusion, then click your Connect Lotsheet favorite again.");
      if (response.status === 403) throw fail("FORBIDDEN", "Your Oracle account cannot read these records.");
      if (!response.ok) throw fail("HTTP", "Oracle could not complete this read (" + response.status + "). Try again.");
      const body = await response.json();
      if (!active) throw fail("CLOSED", "Connection closed.");
      return body;
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  };
  const authorize = async force => {
    if (!force && token && expiresAt > Date.now() + 120000) return token;
    token = "";
    expiresAt = 0;
    const csrf = await get("/fscmRestApi/anticsrf");
    if (typeof csrf.xsrftoken !== "string" || !csrf.xsrftoken) throw fail("AUTH", "Reconnect from your signed-in Fusion tab.");
    const auth = await get("/fscmRestApi/tokenrelay", { headers: { "X-XSRF-TOKEN": csrf.xsrftoken } });
    if (!active) throw fail("CLOSED", "Connection closed.");
    if (typeof auth.access_token !== "string" || !auth.access_token) throw fail("AUTH", "Reconnect from your signed-in Fusion tab.");
    token = auth.access_token;
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const exp = JSON.parse(atob(payload)).exp;
      if (typeof exp === "number" && Number.isFinite(exp)) expiresAt = exp * 1000;
    } catch {}
    return token;
  };
  async function receive(event) {
    const message = event.data;
    if (!active || event.source !== peer || event.origin !== config.appOrigin ||
        !message || message.protocol !== config.protocol || message.channel !== channel) return;
    if (message.type === "hello") {
      connected = true;
      clearTimeout(startup);
      send({ type: "ready" });
      return;
    }
    if (message.type === "disconnect") { stop(); return; }
    if (!connected || message.type !== "read" ||
        typeof message.id !== "string" || !/^[0-9a-f-]{36}$/i.test(message.id) ||
        typeof message.resource !== "string" ||
        !Object.hasOwn(config.resources, message.resource) ||
        typeof message.search !== "string" || !/^[A-Za-z0-9._ -]{0,64}$/.test(message.search) ||
        !Number.isInteger(message.offset) || message.offset < 0 || message.offset > 10000) return;
    if (seen.has(message.id)) return;
    if (busy) { send({ type: "error", id: message.id, code: "BUSY", message: "Wait for the current read to finish." }); return; }
    seen.add(message.id);
    if (seen.size > 100) seen.delete(seen.values().next().value);
    busy = true;
    try {
      const resource = config.resources[message.resource];
      const fields = resource.columns.map(column => column.key);
      const query = new URLSearchParams({ onlyData: "true", limit: "25", offset: String(message.offset), fields: fields.join(",") });
      if (message.search) query.set("q", resource.searchField + "='" + message.search + "'");
      const path = "/fscmRestApi/resources/11.13.18.05/" + resource.path + "?" + query;
      const read = async force => get(path, {
        credentials: "omit", headers: { Authorization: "Bearer " + await authorize(force) },
      });
      let result;
      try { result = await read(false); }
      catch (error) { if (error.code !== "AUTH") throw error; result = await read(true); }
      if (!Array.isArray(result.items)) throw fail("FORMAT", "Oracle returned an unexpected response. Try again.");
      const items = result.items.slice(0, 25).map(item => Object.fromEntries(fields.map(key => {
        const value = item[key];
        return [key, typeof value === "string" ? value.slice(0, 4096) :
          typeof value === "number" && Number.isFinite(value) ? value : null];
      })));
      send({ type: "result", id: message.id, result: {
        resource: message.resource, items, offset: message.offset,
        hasMore: result.hasMore === true, expiresAt: expiresAt || null, fetchedAt: Date.now(),
      } });
    } catch (error) {
      if (error.code === "AUTH") { token = ""; expiresAt = 0; }
      send({ type: "error", id: message.id, code: error.code || "NETWORK",
        message: error.code ? error.message : "Fusion did not respond. Check its tab and try again." });
    } finally { busy = false; }
  }
  const watch = setInterval(() => { if (peer.closed) stop(); }, 5000);
  const startup = setTimeout(stop, 600000);
  window.__lotsheetFusionConnection = { stop };
  window.addEventListener("message", receive);
  window.addEventListener("pagehide", stop);
}
