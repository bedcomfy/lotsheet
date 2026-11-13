import {
  FUSION_ID_PATTERN, FUSION_ORIGIN, FUSION_PROTOCOL, FUSION_SEARCH_PATTERN,
  isFusionResource, parseFusionResult, type FusionResource, type FusionResult,
} from "./config";

export type FusionStatus = "idle" | "connecting" | "connected" | "sign-in-required" | "disconnected";
export interface FusionSnapshot {
  status: FusionStatus;
  reading: boolean;
  result: FusionResult | null;
  error: string | null;
}
export const INITIAL_FUSION_STATE: FusionSnapshot = {
  status: "idle", reading: false, result: null, error: null,
};
const STORAGE_KEY = "pace:fusion:channel:v1";
const ERRORS: Record<string, string> = {
  AUTH: "Sign into Fusion, then click your Connect Lotsheet favorite again.",
  FORBIDDEN: "Your Oracle account cannot read these records. You can try another record type.",
  BUSY: "Wait for the current read to finish, then try again.",
  HTTP: "Oracle could not complete this read. Try another number or try again later.",
  FORMAT: "Oracle returned an unexpected response. Try again later.",
  NETWORK: "Fusion did not respond. Check that its tab is still signed in, then try again.",
};

/** A private connection to this tab's opener; never a server or shared store. */
export class FusionClient {
  private peer: Window | null = null;
  private channel = "";
  private snapshot: FusionSnapshot = { ...INITIAL_FUSION_STATE };
  private pending: { id: string; resource: FusionResource; offset: number; timer: number } | null = null;
  private helloTimer: number | null = null;
  private startTimer: number | null = null;
  private closedTimer: number | null = null;
  private disposed = false;

  constructor(private host: Window, private changed: (state: FusionSnapshot) => void) {}

  private update(patch: Partial<FusionSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.changed(this.snapshot);
  }

  private storeChannel(channel: string | null) {
    try {
      if (channel) this.host.sessionStorage.setItem(STORAGE_KEY, channel);
      else this.host.sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* The open tab still works when browser storage is unavailable. */ }
  }

  start() {
    const hash = new URLSearchParams(this.host.location.hash.slice(1));
    let channel = hash.get("fusion");
    if (!channel) {
      try { channel = this.host.sessionStorage.getItem(STORAGE_KEY); } catch {}
    }
    this.peer = this.host.opener as Window | null;
    if (!channel || !FUSION_ID_PATTERN.test(channel) || !this.peer || this.peer.closed) {
      this.storeChannel(null);
      return;
    }
    this.channel = channel;
    // This is a pairing ID, not an Oracle credential. It only works with the
    // exact opener window and origin; persisting it lets this tab reload.
    this.storeChannel(channel);
    hash.delete("fusion");
    this.host.history.replaceState(this.host.history.state, "",
      this.host.location.pathname + this.host.location.search + (hash.size ? "#" + hash : ""));
    this.host.addEventListener("message", this.receive);
    this.update({ status: "connecting", error: null });
    this.send({ type: "hello" });
    this.helloTimer = this.host.setInterval(() => this.send({ type: "hello" }), 1000);
    this.startTimer = this.host.setTimeout(() => this.close("The connection did not start. Click your favorite in Fusion again."), 15000);
    this.closedTimer = this.host.setInterval(() => {
      if (this.peer?.closed) this.close("The Fusion tab closed. Open Fusion and click your favorite again.");
    }, 5000);
  }

  private send(message: Record<string, unknown>) {
    if (this.disposed || !this.peer || this.peer.closed) return;
    this.peer.postMessage({ protocol: FUSION_PROTOCOL, channel: this.channel, ...message }, FUSION_ORIGIN);
  }

  private receive = (event: MessageEvent) => {
    const message = event.data;
    if (this.disposed || event.origin !== FUSION_ORIGIN || event.source !== this.peer ||
        !message || typeof message !== "object" || message.protocol !== FUSION_PROTOCOL ||
        message.channel !== this.channel) return;
    if (message.type === "closed") { this.close("The Fusion connection ended. Click your favorite in Fusion again."); return; }
    if (message.type === "ready" && this.snapshot.status === "connecting") {
      if (this.helloTimer !== null) this.host.clearInterval(this.helloTimer);
      if (this.startTimer !== null) this.host.clearTimeout(this.startTimer);
      this.helloTimer = this.startTimer = null;
      this.update({ status: "connected" });
      return;
    }
    if (!this.pending || message.id !== this.pending.id) return;
    if (message.type === "result") {
      const result = parseFusionResult(message.result);
      if (!result || result.resource !== this.pending.resource || result.offset !== this.pending.offset) {
        this.finish();
        this.update({ error: "The reply did not match this read. Reconnect to Fusion and try again.", result: null });
        return;
      }
      this.finish();
      this.update({ result, error: null });
    } else if (message.type === "error") {
      this.finish();
      this.update({ result: null, error: typeof message.code === "string" && Object.hasOwn(ERRORS, message.code) ? ERRORS[message.code] : ERRORS.NETWORK,
        status: message.code === "AUTH" ? "sign-in-required" : "connected" });
    }
  };

  private finish() {
    if (this.pending) this.host.clearTimeout(this.pending.timer);
    this.pending = null;
    this.update({ reading: false });
  }

  read(resource: FusionResource, search: string, offset = 0) {
    const clean = search.trim();
    if (this.disposed || this.snapshot.status !== "connected" || this.pending) return;
    if (!isFusionResource(resource) || !FUSION_SEARCH_PATTERN.test(clean) ||
        !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      this.update({ error: "Use a number up to 64 characters, with letters, digits, spaces, dots, dashes, or underscores." });
      return;
    }
    const id = this.host.crypto.randomUUID();
    this.pending = { id, resource, offset, timer: this.host.setTimeout(() =>
      this.close("The Fusion tab did not answer. Click your favorite in Fusion to reconnect."), 60000) };
    this.update({ reading: true, error: null, result: null });
    this.send({ type: "read", id, resource, search: clean, offset });
  }

  clearResults() { if (!this.pending) this.update({ result: null, error: null }); }

  disconnect() {
    this.send({ type: "disconnect" });
    this.close(null);
  }

  private close(error: string | null) {
    this.finish();
    this.storeChannel(null);
    this.clearListeners();
    this.update({ status: "disconnected", result: null, error });
  }

  private clearListeners() {
    this.host.removeEventListener("message", this.receive);
    if (this.helloTimer !== null) this.host.clearInterval(this.helloTimer);
    if (this.startTimer !== null) this.host.clearTimeout(this.startTimer);
    if (this.closedTimer !== null) this.host.clearInterval(this.closedTimer);
    this.helloTimer = this.startTimer = this.closedTimer = null;
  }

  dispose() {
    // React remounts and same-tab navigation must not terminate the Fusion side.
    this.disposed = true;
    if (this.pending) this.host.clearTimeout(this.pending.timer);
    this.pending = null;
    this.clearListeners();
  }
}
