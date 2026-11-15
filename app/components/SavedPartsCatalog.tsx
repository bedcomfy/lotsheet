"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Panel, DataTableFrame, EmptyState, Toolbar } from "../ui/Page";
import { TextField } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { browseCatalog, type CatalogSort, type SavedCatalog } from "../lib/fusion/catalog";
import { FUSION_REQUEST_HEADER } from "../lib/fusion/config";
import styles from "./SavedPartsCatalog.module.css";

export function SavedPartsCatalogView({ catalog, loading = false, refreshing = false, error = null, connected = false, onRefresh, onHistory }: {
  catalog: SavedCatalog | null; loading?: boolean; refreshing?: boolean; error?: string | null; connected?: boolean;
  onRefresh: () => void; onHistory?: (number: string) => void;
}) {
  const [query, setQuery] = useState(""), [location, setLocation] = useState(""), [sort, setSort] = useState<CatalogSort>("number");
  const [descending, setDescending] = useState(false), [visible, setVisible] = useState(50);
  const search = useDeferredValue(query);
  const rows = useMemo(() => browseCatalog(catalog?.parts ?? [], search, location, sort, descending), [catalog, search, location, sort, descending]);
  const locations = useMemo(() => [...new Set(catalog?.parts.flatMap(p => p.locations.map(l => l.locator).filter((l): l is string => !!l)) ?? [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [catalog]);
  function change(action: () => void) { setVisible(50); action(); }
  return <Panel title="Saved Northwest catalog" description="Parts and locations saved in Lotsheet. Available on every device even when Oracle is disconnected."
    actions={<Button onPress={onRefresh} isDisabled={!connected || refreshing}>{refreshing ? "Saving from Oracle…" : "Update saved catalog"}</Button>}>
    {error && <p role="alert" className={styles.error}>{error} {catalog ? "The previous saved catalog is still available." : ""}</p>}
    {!catalog ? <EmptyState kind={loading || refreshing ? "loading" : "empty"} title={loading ? "Loading saved parts" : refreshing ? "Saving Northwest parts" : "No saved catalog yet"}
      description="Connect Oracle and choose Update saved catalog to save a complete copy of part details and locations." /> : <>
      <Toolbar><StatusBadge tone="success">{catalog.parts.length.toLocaleString()} saved parts</StatusBadge><span className={styles.hint}>Saved {new Date(catalog.fetchedAt).toLocaleString()} · No stock quantities stored</span></Toolbar>
      <div className={styles.filters}>
        <TextField label="Search saved parts" placeholder="Name, description, part number or Oracle item ID" value={query} onChange={v => change(() => setQuery(v))} />
        <TextField label="Filter location" placeholder="For example, TANK AREA or Northwest" value={location === "__unassigned__" ? "" : location} onChange={v => change(() => setLocation(v))} />
        <SelectField label="Browse by location" selectedKey={location === "__unassigned__" || locations.includes(location) ? location : ""} onSelectionChange={key => change(() => setLocation(String(key ?? "")))}
          options={[{ id: "", label: "All locations" }, { id: "__unassigned__", label: "No location supplied" }, ...locations.map(l => ({ id: l, label: l }))]} />
        <SelectField label="Sort parts by" selectedKey={sort} onSelectionChange={key => change(() => setSort(key as CatalogSort))}
          options={[{ id: "number", label: "Part number" }, { id: "name", label: "Name" }, { id: "description", label: "Description" }, { id: "location", label: "Location" }]} />
        <Button onPress={() => change(() => setDescending(v => !v))}>{descending ? "Descending" : "Ascending"}</Button>
      </div>
      <p className={styles.hint} role="status">{rows.length.toLocaleString()} matching parts · Showing {Math.min(visible, rows.length).toLocaleString()}</p>
      {rows.length ? <DataTableFrame tabIndex={0} role="region" aria-label="Saved Northwest parts">
        <table className={styles.table}><caption className={styles.srOnly}>Saved Northwest parts catalog</caption><thead><tr><th scope="col">Part number / name</th><th scope="col">Description</th><th scope="col">Locations</th><th scope="col">Associated numbers</th></tr></thead>
          <tbody>{rows.slice(0, visible).map(p => <tr key={p.number}>
            <td><strong>{p.number}</strong><small>{p.name}</small>{connected && onHistory && <Button size="sm" onPress={() => onHistory(p.number)}>View charges</Button>}</td>
            <td>{p.description || "Description not supplied"}{p.unit && <small>Unit: {p.unit}</small>}{p.status && <small>Status: {p.status}</small>}</td>
            <td>{p.locations.length ? p.locations.map((l, i) => <div key={i}>{l.locator || "No locator supplied"}<small>{l.stockroom || "Stockroom not supplied"}</small></div>) : "No location supplied"}</td>
            <td>{p.numbers?.map(n => <div key={n.type + n.value}><small>{n.type === "MPN" ? "Manufacturer part number" : "Global trade item number"}</small>{n.value}</div>)}{p.itemIds.length ? p.itemIds.map(id => <div key={id}><small>Oracle item ID</small>{id}</div>) : "Oracle item ID not supplied"}</td>
          </tr>)}</tbody></table>
      </DataTableFrame> : <EmptyState title="No saved parts match" description="Try another number, description or location, or clear the filters." />}
      {rows.length > visible && <Button onPress={() => setVisible(n => n + 50)}>Show 50 more parts</Button>}
      <p className={styles.hint}>Names use the description before its first colon. Locations are a saved reference and may change. Associated numbers include the manufacturer and trade numbers returned for NWD stockroom items; missing numbers are not proof that none exist. Live stock and charge history require an Oracle connection.</p>
    </>}
  </Panel>;
}

export default function SavedPartsCatalog({ connected, onHistory }: { connected: boolean; onHistory?: (number: string) => void }) {
  const [catalog, setCatalog] = useState<SavedCatalog | null>(null), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/fusion/catalog", { headers: { [FUSION_REQUEST_HEADER]: "1" }, cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error("Saved catalog unavailable."); const body = await response.json(); if (!controller.signal.aborted) setCatalog(body.catalog); })
      .catch(() => { if (!controller.signal.aborted) setError("The saved catalog could not be loaded. Reload this page to retry."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function refresh() {
    if (refreshing) return; setRefreshing(true); setError(null);
    try {
      const response = await fetch("/api/fusion/catalog", { method: "POST", headers: { [FUSION_REQUEST_HEADER]: "1" }, cache: "no-store", signal: AbortSignal.timeout(180000) });
      const body = await response.json(); if (!response.ok) throw Error(body.error || "The catalog update could not finish."); setCatalog(body.catalog);
    } catch (e) { setError(e instanceof Error ? e.message : "The catalog update could not finish."); }
    finally { setRefreshing(false); }
  }
  return <SavedPartsCatalogView catalog={catalog} loading={loading} refreshing={refreshing} error={error} connected={connected} onRefresh={() => void refresh()} onHistory={onHistory} />;
}
