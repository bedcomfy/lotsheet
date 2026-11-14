import { FUSION_REQUEST_HEADER } from "./config";
import { emptyPartsIndex, indexIsComplete, PARTS_MAX_OFFSET, type IndexKind, type Part, type PartBalance, type PartCharge, type PartLocation, type PartsIndex, type PartsPage } from "./parts";
import type { PartsCache } from "./parts-cache";

export interface PartHistory {
  partId: string | null; rows: PartCharge[]; status: "idle" | "loading" | "complete" | "error";
  error: string | null; fetchedAt: number | null;
}
export interface PartsSnapshot {
  status: "checking" | "connected" | "disconnected" | "error";
  index: PartsIndex | null; indexing: boolean; error: string | null; history: PartHistory;
}
export const EMPTY_HISTORY: PartHistory = { partId: null, rows: [], status: "idle", error: null, fetchedAt: null };
export const INITIAL_PARTS_STATE: PartsSnapshot = { status: "checking", index: null, indexing: false, error: null, history: EMPTY_HISTORY };
const ERRORS: Record<string, string> = {
  AUTH: "Sign into Fusion and click Connect Lotsheet again.",
  CONNECTION: "Your Fusion connection changed. Reload this page to use the new connection.",
  FORBIDDEN: "Your Oracle account cannot read these records.",
  FORMAT: "Oracle returned unexpected or overlapping records. Refresh to try again; these results are incomplete.",
  LIMIT: "The safety limit was reached. These results are incomplete.",
  NETWORK: "The read could not finish. Check your connection and try again.",
  HTTP: "Oracle rejected this data request. Your connection may still be valid.",
  STORAGE: "Private Oracle token storage is unavailable. Try again shortly.",
};
class ReadError extends Error {
  constructor(public code: string, diagnostic?: { resource?: string; upstreamStatus?: number; stage?: string }) {
    const resource = diagnostic?.resource && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(diagnostic.resource) ? diagnostic.resource : null;
    const status = diagnostic?.upstreamStatus;
    super((ERRORS[code] ?? ERRORS.NETWORK) + (resource ? ` (${resource}${Number.isInteger(status) ? `, HTTP ${status}` : ""})` : ""));
  }
}
export function checkPage<T>(page: PartsPage<T>, offset: number, connectionId: string) {
  if (page?.connectionId !== connectionId) throw new ReadError("CONNECTION");
  if (!Array.isArray(page.items) || page.offset !== offset || typeof page.hasMore !== "boolean" ||
      !Number.isInteger(page.nextOffset) || page.nextOffset < offset || (page.hasMore && page.nextOffset <= offset)) throw new ReadError("FORMAT");
  if (page.expiresAt <= Date.now()) throw new ReadError("AUTH");
  if (page.nextOffset > PARTS_MAX_OFFSET && page.hasMore) throw new ReadError("LIMIT");
}
export class PartsClient {
  private state: PartsSnapshot = INITIAL_PARTS_STATE;
  private run: AbortController | null = null;
  private historyRun: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  constructor(private request: typeof fetch, private cache: PartsCache, private notify: (state: PartsSnapshot) => void) {}
  private update(patch: Partial<PartsSnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; this.notify(this.state);
  }
  private async call<T>(params: Record<string, string>, signal: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await this.request("/api/fusion/parts?" + new URLSearchParams(params), { credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { [FUSION_REQUEST_HEADER]: "1", Accept: "application/json",
          ...(params.kind !== "context" && this.state.index ? { "X-Lotsheet-Fusion-Connection": this.state.index.connectionId } : {}) },
        signal: AbortSignal.any([signal, AbortSignal.timeout(80_000)]) });
    } catch { throw new ReadError("NETWORK"); }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ReadError(response.status === 401 ? "AUTH" : response.status === 403 ? "FORBIDDEN" : Object.hasOwn(ERRORS, body?.code ?? "") ? body.code : "NETWORK", body?.diagnostic);
    }
    try { return await response.json(); } catch { throw new ReadError("FORMAT"); }
  }
  private failAuth(error: unknown) {
    if (!(error instanceof ReadError) || !["AUTH", "CONNECTION"].includes(error.code)) return false;
    this.run?.abort(); this.historyRun?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.update({ status: "disconnected", index: null, indexing: false, history: EMPTY_HISTORY, error: error.message });
    void this.cache.clear(); return true;
  }
  async connect(force = false) {
    this.run?.abort(); this.historyRun?.abort();
    if (this.timer) clearTimeout(this.timer);
    const controller = new AbortController(); this.run = controller;
    const { signal } = controller;
    this.update({ ...INITIAL_PARTS_STATE });
    try {
      const context = await this.call<{ connectionId: string; expiresAt: number; organization: string }>({ kind: "context" }, signal);
      if (signal.aborted || this.disposed) return;
      if (!/^[a-f0-9]{64}$/.test(context.connectionId) || context.organization !== "NWD" || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) throw new ReadError("FORMAT");
      this.timer = setTimeout(() => this.failAuth(new ReadError("AUTH")), context.expiresAt - Date.now());
      const cached = force ? null : await this.cache.load(context.connectionId);
      if (signal.aborted || this.disposed) return;
      const index = cached ?? emptyPartsIndex(context.connectionId, context.expiresAt);
      this.update({ status: "connected", index, indexing: !cached, error: null });
      if (cached) return;
      await this.cache.clear();
      // Two streams keep the catalog responsive without flooding Oracle.
      await Promise.all([
        (async () => { await this.loadIndex("catalog", signal); await this.loadIndex("subinventories", signal); })(),
        (async () => { await this.loadIndex("locations", signal); await this.loadIndex("balances", signal); })(),
      ]);
      if (signal.aborted || this.disposed) return;
      this.update({ indexing: false });
      if (this.state.index && indexIsComplete(this.state.index)) await this.cache.save(this.state.index);
    } catch (error) {
      if (signal.aborted || this.disposed) return;
      if (!this.failAuth(error)) this.update({ status: "error", indexing: false, error: error instanceof ReadError ? error.message : ERRORS.NETWORK });
    }
  }
  private async loadIndex(kind: IndexKind, signal: AbortSignal) {
    if (signal.aborted || !this.state.index) return;
    const field = kind === "catalog" ? "parts" : kind;
    let offset = 0, report = false;
    const seen = new Set<string>();
    const setStage = (status: "loading" | "complete" | "error", error: string | null = null, time: number | null = null) => {
      const current = this.state.index;
      if (!current || signal.aborted) return;
      this.update({ index: { ...current, progress: { ...current.progress, [kind]: { status, offset, fetchedAt: time ?? current.progress[kind].fetchedAt, error } } } });
    };
    setStage("loading");
    try {
      while (!signal.aborted) {
        let page: PartsPage<Part | PartLocation | PartBalance>;
        try { page = await this.call({ kind: report ? "stock-report" : kind, offset: String(offset) }, signal); }
        catch (error) {
          if (signal.aborted || this.failAuth(error)) return;
          if (kind !== "balances" || report) throw error;
          report = true; offset = 0; seen.clear();
          this.update({ index: { ...this.state.index!, balances: [], stockSource: "buyers-report" } });
          continue;
        }
        if (signal.aborted || !this.state.index) return;
        checkPage(page, offset, this.state.index.connectionId);
        for (const row of page.items) {
          const key = "id" in row ? row.id : row.key;
          if (!key || seen.has(key)) throw new ReadError("FORMAT");
          seen.add(key);
        }
        offset = page.nextOffset;
        const current = this.state.index;
        this.update({ index: { ...current, [field]: [...current[field], ...page.items],
          stockSource: kind === "balances" ? (report ? "buyers-report" : "onhand") : current.stockSource } as PartsIndex });
        setStage(page.hasMore ? "loading" : "complete", null, page.fetchedAt);
        if (!page.hasMore) break;
      }
    } catch (error) {
      if (signal.aborted || this.failAuth(error)) return;
      setStage("error", error instanceof ReadError ? error.message : ERRORS.NETWORK);
    }
  }
  async selectPart(partId: string | null) {
    this.historyRun?.abort();
    if (!partId) { this.update({ history: EMPTY_HISTORY }); return; }
    if (!this.state.index?.parts.some(part => part.id === partId)) return;
    const controller = new AbortController(); this.historyRun = controller;
    const { signal } = controller;
    const connectionId = this.state.index.connectionId;
    const seen = new Set<string>(); let rows: PartCharge[] = [], offset = 0;
    this.update({ history: { ...EMPTY_HISTORY, partId, status: "loading" } });
    try {
      while (!signal.aborted) {
        const page = await this.call<PartsPage<PartCharge>>({ kind: "history", itemId: partId, offset: String(offset) }, signal);
        if (signal.aborted || this.disposed) return;
        checkPage(page, offset, connectionId);
        for (const row of page.items) { if (!row.key || seen.has(row.key)) throw new ReadError("FORMAT"); seen.add(row.key); }
        rows = [...rows, ...page.items]; offset = page.nextOffset;
        this.update({ history: { partId, rows, status: page.hasMore ? "loading" : "complete", error: null, fetchedAt: page.fetchedAt } });
        if (!page.hasMore) return;
      }
    } catch (error) {
      if (signal.aborted || this.disposed || this.failAuth(error)) return;
      this.update({ history: { ...this.state.history, status: "error", error: error instanceof ReadError ? error.message : ERRORS.NETWORK } });
    }
  }
  /** Validate on returning to the tab; never continue showing another session's cache. */
  async checkConnection() {
    if (this.disposed || this.state.status === "checking") return;
    const controller = this.run;
    if (!controller || controller.signal.aborted) return;
    try {
      const context = await this.call<{ connectionId: string }>({ kind: "context" }, controller.signal);
      if (controller.signal.aborted || this.disposed) return;
      if (this.state.index && context.connectionId !== this.state.index.connectionId) this.failAuth(new ReadError("CONNECTION"));
    } catch (error) {
      if (controller.signal.aborted || this.disposed || this.failAuth(error)) return;
      if (error instanceof ReadError && error.code === "FORBIDDEN") {
        controller.abort(); this.historyRun?.abort();
        this.update({ status: "error", index: null, indexing: false, history: EMPTY_HISTORY, error: error.message });
        void this.cache.clear();
      } else this.update({ error: "The current Oracle connection could not be checked. Displayed values are from the previous read." });
    }
  }
  dispose() { this.disposed = true; this.run?.abort(); this.historyRun?.abort(); if (this.timer) clearTimeout(this.timer); }
}
