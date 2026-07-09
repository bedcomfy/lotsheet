"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Save } from "lucide-react";
import { cellLocationLabel, flagName } from "../lib/grid";
import { getDeviceActor, setDeviceActor } from "../lib/deviceActor";
import type { FlagEntry } from "../lib/types";
import type { LotSheetOp, LotSheetOpRecord } from "../lib/lotSheetOps";

interface AuditEvent {
  id: string;
  kind: string;
  actor?: string;
  details: unknown;
  createdAt: string | null;
}

type FeedItem = {
  id: string;
  at: string | null;
  actor: string;
  title: string;
  detail: string;
  badge: string;
};

const LOT_LABELS: Record<string, string> = {
  north: "North Lot",
  east: "East Lot",
  fence: "Fence",
  rc: "R/C",
  apron: "Apron",
  northlane: "North Lane",
  southlane: "South Lane",
  bay: "Bay",
  cards: "Cards",
};

function timeLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function busLabel(value: string) {
  return value || "blank";
}

function sheetSummary(op: LotSheetOp): { title: string; detail: string; badge: string } {
  if (op.type === "set_cell") {
    const loc = cellLocationLabel(op.id) || op.id;
    if (!op.value) return { title: `Cleared ${loc}`, detail: "Cell was emptied", badge: "Cell" };
    if (op.value === "X") return { title: `Blocked ${loc}`, detail: "Cell marked unavailable", badge: "Cell" };
    return { title: `Set ${loc} to ${busLabel(op.value)}`, detail: "Bus location updated", badge: "Cell" };
  }
  if (op.type === "set_lot") {
    const label = LOT_LABELS[op.key] || op.key;
    return { title: `Updated ${label}`, detail: `${op.value.filter(Boolean).length} bus${op.value.filter(Boolean).length === 1 ? "" : "es"}`, badge: "Lot" };
  }
  if (op.type === "remove_bus") return { title: `Removed ${op.bus}`, detail: "Bus removed from cells/lots before being moved", badge: "Move" };
  if (op.type === "set_locks") return { title: "Updated locked spots", detail: `${op.value.length} locked spot${op.value.length === 1 ? "" : "s"}`, badge: "Lock" };
  if (op.type === "set_field") return { title: `Updated ${op.field}`, detail: op.value || "blank", badge: "Header" };
  if (op.type === "set_bool") {
    const label = op.field === "timeOverride" ? "time override" : "date override";
    return { title: `${op.value ? "Enabled" : "Cleared"} ${label}`, detail: "Header auto-fill setting changed", badge: "Header" };
  }
  return { title: "Replaced Lot Sheet", detail: "Full sheet replacement", badge: "Sheet" };
}

function flags(entry: FlagEntry | null | undefined) {
  return Array.isArray(entry?.flags) ? entry.flags : [];
}

function flagDetails(details: unknown): { title: string; detail: string; badge: string } {
  const d = (details || {}) as { bus?: string; before?: FlagEntry | null; after?: FlagEntry | null };
  const bus = d.bus || "bus";
  const before = d.before || null;
  const after = d.after || null;
  const beforeFlags = flags(before);
  const afterFlags = flags(after);
  const added = afterFlags.filter((f) => !beforeFlags.includes(f));
  const removed = beforeFlags.filter((f) => !afterFlags.includes(f));
  const changes: string[] = [];
  if (added.length) changes.push(`added ${added.map(flagName).join(", ")}`);
  if (removed.length) changes.push(`removed ${removed.map(flagName).join(", ")}`);
  if ((before?.note || "") !== (after?.note || "")) changes.push(after?.note ? "changed note" : "cleared note");
  if ((before?.holdReason || "") !== (after?.holdReason || "")) changes.push(after?.holdReason ? "changed hold reason" : "cleared hold reason");
  if ((before?.inspOption || "") !== (after?.inspOption || "")) changes.push(after?.inspOption ? "changed inspection" : "cleared inspection");
  if (JSON.stringify(before?.retorqueTires || []) !== JSON.stringify(after?.retorqueTires || [])) changes.push("changed retorque tires");
  return {
    title: `Updated flags for ${bus}`,
    detail: changes.length ? changes.join("; ") : "Flag details changed",
    badge: "Flag",
  };
}

function adminFlagConfigDetails(details: unknown): { title: string; detail: string; badge: string } {
  const d = (details || {}) as { before?: { flags?: Record<string, unknown> }; after?: { flags?: Record<string, unknown> } };
  const before = d.before?.flags || {};
  const after = d.after?.flags || {};
  const changed = new Set([...Object.keys(before), ...Object.keys(after)]);
  let count = 0;
  for (const id of changed) {
    if (JSON.stringify(before[id] || null) !== JSON.stringify(after[id] || null)) count += 1;
  }
  return {
    title: "Updated flag settings",
    detail: count ? `${count} flag setting${count === 1 ? "" : "s"} changed` : "Flag settings saved",
    badge: "Admin",
  };
}

export default function AuditLog() {
  const [ops, setOps] = useState<LotSheetOpRecord[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [device, setDevice] = useState("");
  const [saved, setSaved] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/sheet/ops?latest=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/audit?limit=150", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([opData, auditData]) => {
      setOps(Array.isArray(opData.ops) ? opData.ops : []);
      setEvents(Array.isArray(auditData.events) ? auditData.events : []);
    });
  }

  useEffect(() => {
    setDevice(getDeviceActor());
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  const feed = useMemo<FeedItem[]>(() => {
    const sheetItems: FeedItem[] = ops.map((record) => {
      const summary = sheetSummary(record.op);
      return {
        id: `sheet-${record.revision}`,
        at: record.createdAt || null,
        actor: record.actor || "Unknown device",
        ...summary,
      };
    });
    const auditItems: FeedItem[] = events.map((event) => {
      const summary = event.kind === "flag_update"
        ? flagDetails(event.details)
        : event.kind === "admin_flag_config_update"
          ? adminFlagConfigDetails(event.details)
          : { title: event.kind, detail: "", badge: "Audit" };
      return {
        id: `audit-${event.id}`,
        at: event.createdAt,
        actor: event.actor || "Unknown device",
        ...summary,
      };
    });
    return [...sheetItems, ...auditItems]
      .sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0))
      .slice(0, 150);
  }, [events, ops]);

  function saveDevice() {
    setDeviceActor(device);
    setDevice(getDeviceActor());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <main className="audit">
      <section className="audit__head">
        <div>
          <div className="homehero__eyebrow">Operations Monitor</div>
          <h1>Audit Log</h1>
          <p>Live history of Lot Sheet changes, shop/turnover lot edits, and flag updates.</p>
        </div>
        <div className="auditdevice">
          <label>
            This device
            <input value={device} onChange={(e) => setDevice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveDevice()} />
          </label>
          <button className="btn btn--primary" onClick={saveDevice}>
            <Save size={15} /> {saved ? "Saved" : "Save"}
          </button>
        </div>
      </section>

      <section className="auditbar">
        <span><Activity size={16} /> {feed.length} latest events</span>
        <button className="btn" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
      </section>

      <section className="auditlist" aria-label="Revision history">
        {feed.length ? feed.map((item) => (
          <article className="auditrow" key={item.id}>
            <span className="auditrow__badge">{item.badge}</span>
            <div className="auditrow__main">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
            <div className="auditrow__meta">
              <span>{item.actor}</span>
              <time>{timeLabel(item.at)}</time>
            </div>
          </article>
        )) : (
          <div className="auditempty">No revision history yet.</div>
        )}
      </section>
    </main>
  );
}
