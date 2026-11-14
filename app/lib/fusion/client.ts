import {
  FUSION_ID_PATTERN, FUSION_ORIGIN, FUSION_PROTOCOL, FUSION_SEARCH_PATTERN,
  FUSION_RECORDS_PATH, FUSION_REQUEST_HEADER, FUSION_SESSION_PATH,
  isFusionResource, parseFusionResult, type FusionResource, type FusionResult,
} from "./config";

export type FusionStatus = "idle" | "connecting" | "connected" | "sign-in-required" | "disconnected";
export interface FusionSnapshot {
  status: FusionStatus;
  reading: boolean;
  result: FusionResult | null;
  expiresAt: number | null;
  error: string | null;
  storage?: "server" | "browser";
  shared?: boolean;
}
export const INITIAL_FUSION_STATE: FusionSnapshot = {
  status: "idle", reading: false, result: null, expiresAt: null, error: null,
};
const STORAGE_KEY = "pace:fusion:handoff:v2";
const REAUTH = "Sign into Fusion, then click your Connect Lotsheet favorite again.";
const ERRORS: Record<string, string> = {
  AUTH: REAUTH,
  FORBIDDEN: "Your Oracle account cannot read these records. Try another record type.",
  REQUEST: "The request could not be accepted. Reload Lotsheet and try again.",
  FORMAT: "Oracle returned an unexpected response. Try again later.",
  HTTP: "Oracle could not complete this read. Try another number or try again later.",
  NETWORK: "Oracle could not be reached. Try again shortly.",
  SAVE: "Access could not be saved in this browser. Check its cookie settings and reconnect.",
  STORAGE: "Private Oracle token storage is unavailable. Try connecting again shortly.",
};
class ApiFailure extends Error {
  constructor(public code: string) { super(Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.NETWORK); }
}

/** Credentials are handed straight to the server. Server storage uses an
 * HttpOnly tester permit; legacy deployments use an HttpOnly bearer cookie.
 * Only non-secret status and result data enter this object's state. */
export class FusionClient {
  private snapshot: FusionSnapshot = { ...INITIAL_FUSION_STATE };
  private peer: Window | null = null;
  private channel = "";
  private disposed = false;
  private accepting = false;
  private restoring = false;
  private generation = 0;
  private helloTimer: number | null = null;
  private startTimer: number | null = null;
  private closedTimer: number | null = null;
  private expiryTimer: number | null = null;
  private controllers = new Set<AbortController>();

  constructor(private host: Window, private changed: (state: FusionSnapshot) => void) {}

  private update(patch: Partial<FusionSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.changed(this.snapshot);
  }

  private storeChannel(channel: string | null) {
    try {
      this.host.sessionStorage.removeItem("pace:fusion:channel:v1");
      if (channel) this.host.sessionStorage.setItem(STORAGE_KEY, channel);
      else this.host.sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  start() {
    this.host.addEventListener("focus", this.onFocus);
    const hash = new URLSearchParams(this.host.location.hash.slice(1));
    let channel = hash.get("fusion");
    if (!channel) { try { channel = this.host.sessionStorage.getItem(STORAGE_KEY); } catch {} }
    this.peer = this.host.opener as Window | null;
    if (channel && FUSION_ID_PATTERN.test(channel) && this.peer && !this.peer.closed) {
      this.channel = channel;
      this.storeChannel(channel);
      hash.delete("fusion");
      this.host.history.replaceState(this.host.history.state, "",
        this.host.location.pathname + this.host.location.search + (hash.size ? "#" + hash : ""));
      this.host.addEventListener("message", this.receive);
      this.update({ status: "connecting", error: null });
      this.send("hello");
      this.helloTimer = this.host.setInterval(() => this.send("hello"), 1000);
      this.startTimer = this.host.setTimeout(() => this.handoffFailed("The favorite did not connect. Copy the current favorite address from this page and try again."), 60000);
      this.closedTimer = this.host.setInterval(() => {
        if (this.peer?.closed) this.handoffFailed("Fusion closed before access was received. Click your favorite in Fusion again.");
      }, 1000);
    } else {
      this.storeChannel(null);
      this.peer = null;
      void this.restore();
    }
  }

  private send(type: string) {
    if (!this.disposed && this.peer && !this.peer.closed) {
      this.peer.postMessage({ protocol: FUSION_PROTOCOL, channel: this.channel, type }, FUSION_ORIGIN);
    }
  }

  private receive = (event: MessageEvent) => {
    const message = event.data;
    if (this.disposed || this.accepting || event.origin !== FUSION_ORIGIN || event.source !== this.peer ||
        !message || message.protocol !== FUSION_PROTOCOL || message.channel !== this.channel) return;
    if (message.type === "error") { this.handoffFailed(REAUTH); return; }
    if (message.type !== "authorization" || typeof message.accessToken !== "string" ||
        !message.accessToken || message.accessToken.length > 3500) return;
    this.accepting = true;
    this.clearBridgeTimers();
    void this.saveAccess(message.accessToken);
  };

  private async call(path: string, options: RequestInit = {}) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = this.host.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await this.host.fetch(path, {
        ...options, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { [FUSION_REQUEST_HEADER]: "1", Accept: "application/json", ...options.headers },
      });
      const body = await response.json();
      if (!response.ok) throw new ApiFailure(typeof body?.code === "string" ? body.code : "NETWORK");
      return body;
    } finally { this.host.clearTimeout(timeout); this.controllers.delete(controller); }
  }

  private connected(expiresAt: unknown) {
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new ApiFailure("AUTH");
    if (this.disposed) return;
    if (this.expiryTimer !== null) this.host.clearTimeout(this.expiryTimer);
    this.expiryTimer = this.host.setTimeout(() => {
      this.expire();
      void this.restore(true);
    }, Math.min(expiresAt - Date.now() + 50, 2147483647));
    this.update({ status: "connected", expiresAt, error: null });
  }

  private async saveAccess(accessToken: string) {
    try {
      const session = await this.call(FUSION_SESSION_PATH, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }) });
      if (this.disposed) return;
      if (session.connected !== true) throw new ApiFailure("AUTH");
      const saved = await this.call(FUSION_SESSION_PATH);
      if (this.disposed) return;
      if (saved.connected !== true) throw new ApiFailure("SAVE");
      this.connected(saved.expiresAt);
      this.update({ storage: saved.storage === "server" ? "server" : "browser", shared: saved.shared === true });
      this.send("complete");
      this.detachBridge();
    } catch (error) {
      if (!this.disposed) this.handoffFailed(error instanceof ApiFailure ? error.message : ERRORS.NETWORK);
    }
  }

  private async restore(required = false) {
    if (this.restoring || this.disposed || this.snapshot.status === "connecting" || this.snapshot.reading) return;
    this.restoring = true;
    const generation = this.generation;
    try {
      const session = await this.call(FUSION_SESSION_PATH);
      if (this.disposed || generation !== this.generation) return;
      if (session.connected === true) {
        this.connected(session.expiresAt);
        this.update({ storage: session.storage === "server" ? "server" : "browser", shared: session.shared === true });
      }
      else if (required || this.snapshot.expiresAt) this.expire();
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        if (error instanceof ApiFailure && error.code === "AUTH") this.expire();
        else this.update({ error: error instanceof ApiFailure ? error.message : "Saved access could not be checked. Reload Lotsheet and try again." });
      }
    } finally { this.restoring = false; }
  }

  private onFocus = () => {
    // An unexpired cookie can still be rejected by Oracle. Returning focus must
    // not turn that rejection back into a connected state without a new login.
    if (this.snapshot.status !== "sign-in-required") void this.restore(this.snapshot.status === "connected");
  };

  async read(resource: FusionResource, search: string, offset = 0) {
    const clean = search.trim();
    if (this.disposed || this.snapshot.status !== "connected" || this.snapshot.reading) return;
    if (!this.snapshot.expiresAt || this.snapshot.expiresAt <= Date.now()) { this.expire(); return; }
    if (!isFusionResource(resource) || !FUSION_SEARCH_PATTERN.test(clean) ||
        !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      this.update({ error: "Use a number up to 64 characters, with letters, digits, spaces, dots, dashes, or underscores." });
      return;
    }
    const generation = ++this.generation;
    this.update({ reading: true, error: null, result: null });
    try {
      const query = new URLSearchParams({ resource, search: clean, offset: String(offset) });
      const result = parseFusionResult(await this.call(FUSION_RECORDS_PATH + "?" + query));
      if (this.disposed || generation !== this.generation) return;
      if (!result || result.resource !== resource || result.offset !== offset) throw new ApiFailure("FORMAT");
      this.connected(result.expiresAt);
      this.update({ result });
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      if (error instanceof ApiFailure && error.code === "AUTH") this.expire();
      else this.update({ error: error instanceof ApiFailure ? error.message : ERRORS.NETWORK, result: null });
    } finally { if (generation === this.generation) this.update({ reading: false }); }
  }

  clearResults() { if (!this.snapshot.reading) this.update({ result: null, error: null }); }

  async disconnect() {
    if (this.snapshot.status === "connecting") return;
    this.generation++;
    this.controllers.forEach(controller => controller.abort());
    this.update({ result: null, reading: true });
    try {
      await this.call(FUSION_SESSION_PATH, { method: "DELETE" });
      if (this.expiryTimer !== null) this.host.clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
      this.update({ status: "disconnected", expiresAt: null, error: null });
    } catch { this.update({ error: "Saved access could not be removed. Try Disconnect again." }); }
    finally { this.update({ reading: false }); }
  }

  private expire() {
    this.generation++;
    this.controllers.forEach(controller => controller.abort());
    if (this.expiryTimer !== null) this.host.clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.update({ status: "sign-in-required", reading: false, expiresAt: null, result: null, error: REAUTH });
  }

  private handoffFailed(error: string) {
    this.send("cancel");
    this.detachBridge();
    this.update({ status: "sign-in-required", result: null, expiresAt: null, error });
  }

  private clearBridgeTimers() {
    if (this.helloTimer !== null) this.host.clearInterval(this.helloTimer);
    if (this.closedTimer !== null) this.host.clearInterval(this.closedTimer);
    if (this.startTimer !== null) this.host.clearTimeout(this.startTimer);
    this.helloTimer = this.closedTimer = this.startTimer = null;
  }

  private detachBridge() {
    this.clearBridgeTimers();
    this.host.removeEventListener("message", this.receive);
    this.storeChannel(null);
    this.peer = null;
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.controllers.forEach(controller => controller.abort());
    this.clearBridgeTimers();
    if (this.expiryTimer !== null) this.host.clearTimeout(this.expiryTimer);
    this.host.removeEventListener("message", this.receive);
    this.host.removeEventListener("focus", this.onFocus);
    // Keep an unfinished non-secret handoff ID for React remounts/reloads. A
    // completed session lives in its cookie and is never deleted on unmount.
  }
}
