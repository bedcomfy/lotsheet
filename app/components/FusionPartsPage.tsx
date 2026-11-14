"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, PackageSearch, RefreshCw } from "lucide-react";
import { AppPage, DataTableFrame, EmptyState, PageHeader, Panel, Toolbar, ToolbarGroup } from "../ui/Page";
import { Button } from "../ui/Button";
import { ComboBoxField } from "../ui/ComboBoxField";
import { SelectField } from "../ui/SelectField";
import { Checkbox } from "../ui/Checkbox";
import { StatusBadge } from "../ui/StatusBadge";
import { PartsClient, INITIAL_PARTS_STATE, type PartsSnapshot } from "../lib/fusion/parts-client";
import { browserPartsCache } from "../lib/fusion/parts-cache";
import { balanceTotal, findParts, indexIsComplete, partBalances, partLocations, PARTS_CACHE_AGE, type Part, type PartsIndex } from "../lib/fusion/parts";
import styles from "./FusionPartsPage.module.css";

const time = (timestamp: number | null) => timestamp ? new Date(timestamp).toLocaleString() : "Not yet read";
const quantity = (value: number | null) => value === null ? "Unknown" : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not supplied";
const STAGES = [ ["catalog", "Parts", "parts"], ["locations", "Locator assignments", "locations"], ["subinventories", "Stockroom assignments", "subinventories"], ["balances", "Stock balances", "balances"] ] as const;

export interface FusionPartsViewProps {
  state: PartsSnapshot; onRefresh: () => void; onSelect: (id: string | null) => void; onConnect: () => void;
}
export function FusionPartsView({ state, onRefresh, onSelect, onConnect }: FusionPartsViewProps) {
  const [search, setSearch] = useState("");
  const [bus, setBus] = useState("all");
  const [returns, setReturns] = useState(true);
  const [visible, setVisible] = useState(50);
  const deferredSearch = useDeferredValue(search);
  const { index, history } = state;
  const suggestions = useMemo(() => findParts(index?.parts ?? [], deferredSearch).map(p => ({ id: p.id, label: p.number, description: p.description })), [index?.parts, deferredSearch]);
  const part = index?.parts.find(p => p.id === history.partId);
  const buses = useMemo(() => [...new Set(history.rows.map(row => row.bus).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [history.rows]);
  const filtered = useMemo(() => history.rows.filter(row => (bus === "all" || row.bus === bus) && (returns || row.type === "MATERIAL_ISSUE")), [history.rows, bus, returns]);
  const workOrders = new Set(filtered.filter(row => row.type === "MATERIAL_ISSUE").map(row => row.workOrderId)).size;
  const complete = !!index && indexIsComplete(index);
  const stale = !!index && Date.now() - index.startedAt >= PARTS_CACHE_AGE;
  function select(id: string | null) { setBus("all"); setVisible(50); onSelect(id); }
  return <AppPage className={styles.page}>
    <PageHeader title="Parts & charge history" eyebrow="Northwest Division"
      description="Find a part, check its stock and storage locations, and see the work orders it was charged to."
      actions={<>
        <Button onPress={onConnect}><Cable aria-hidden="true" /> Oracle connection</Button>
        <Button onPress={onRefresh} isDisabled={state.indexing || state.status === "checking"}><RefreshCw aria-hidden="true" /> {state.indexing ? "Indexing…" : "Refresh index"}</Button>
      </>} />
    <Toolbar>
      <ToolbarGroup><StatusBadge>Northwest only</StatusBadge><StatusBadge>Read-only</StatusBadge>
        <StatusBadge tone={state.status === "connected" ? "success" : "warning"}>{state.status === "connected" ? "Oracle connected" : state.status === "checking" ? "Checking connection" : state.status === "error" ? "Northwest read failed" : "Connection required"}</StatusBadge>
      </ToolbarGroup>
      {index && <span className={styles.hint}>Access expires {time(index.expiresAt)}</span>}
    </Toolbar>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {!index ? <EmptyState kind={state.status === "checking" ? "loading" : state.status === "error" ? "error" : "empty"}
      title={state.status === "checking" ? "Checking Northwest access" : state.status === "error" ? "Northwest catalog could not be read" : "Connect to Oracle Fusion"}
      description={state.status === "checking" ? "Validating your saved connection before loading parts." : state.status === "error" ? "Saved Oracle access and catalog access are separate checks. The error above identifies the failed read; try Refresh index to retry." : "Use your Connect Lotsheet favorite in your signed-in Fusion browser, then open Parts here."}
      action={state.status !== "checking" ? <Button variant="primary" onPress={onConnect}>Open Oracle connection</Button> : undefined} /> : <>
      <Panel title="Northwest parts index" description={complete ? "All pages returned by Oracle have been indexed for the current connection." : "Search becomes available as parts load. Results remain partial until every section finishes."}
        actions={<StatusBadge tone={complete ? stale ? "warning" : "success" : state.indexing ? "info" : "warning"}>{complete ? stale ? "Refresh recommended" : "Index complete" : state.indexing ? "Building index" : "Index incomplete"}</StatusBadge>}>
        <div className={styles.progress} aria-label="Index progress">
          {STAGES.map(([kind, label, field]) => <div className={styles.stage} key={kind}>
            <span>{label}</span><strong>{index[field].length.toLocaleString()}</strong>
            <span className={styles.hint}>{index.progress[kind].status === "complete" ? "Complete" : index.progress[kind].status === "error" ? "Incomplete" : index.progress[kind].status === "loading" ? "Reading…" : "Waiting"}</span>
            {index.progress[kind].error && <span className={styles.error}>{index.progress[kind].error}</span>}
          </div>)}
        </div>
        <p className={styles.hint}>Snapshot started {time(index.startedAt)}. Stock can change after a read. Refresh for current balances; only records available to your Oracle account are included.</p>
      </Panel>
      <Panel title="Find a part" description="Start with a part number or words from its description.">
        <ComboBoxField label="Part number or name" placeholder="For example, coolant or 910090" options={suggestions}
          inputValue={search} onInputChange={setSearch} selectedKey={history.partId} onSelectionChange={key => select(key === null ? null : String(key))}
          isDisabled={!index.parts.length} emptyMessage={index.progress.catalog.status === "complete" ? "No matching Northwest parts. Try fewer words." : "No match in the parts loaded so far."}
          description="Up to 40 suggestions are shown. Add more words or digits to narrow the list." />
      </Panel>
      {part ? <>
        <PartStock index={index} part={part} />
        <Panel title={`Charge history · ${part.number}`} description={part.description}
          actions={<Button size="sm" onPress={() => onSelect(part.id)} isDisabled={history.status === "loading"}>Refresh history</Button>}>
          <div className={styles.filters}>
            <SelectField label="Bus" selectedKey={bus} options={[{ id: "all", label: "All buses" }, ...buses.map(b => ({ id: b, label: "Bus " + b }))]}
              onSelectionChange={key => { setBus(String(key)); setVisible(50); }} />
            <Checkbox isSelected={returns} onChange={value => { setReturns(value); setVisible(50); }}>Include part returns</Checkbox>
          </div>
          <Toolbar className={styles.historySummary}>
            <span>{workOrders.toLocaleString()} work orders with charges · {filtered.length.toLocaleString()} entries{history.status !== "complete" ? " loaded so far" : ""}</span>
            <StatusBadge tone={history.status === "complete" ? "success" : history.status === "error" ? "warning" : "info"}>{history.status === "complete" ? "All available entries loaded" : history.status === "error" ? "History incomplete" : "Reading history…"}</StatusBadge>
          </Toolbar>
          {history.error && <p role="alert" className={styles.error}>{history.error}</p>}
          {filtered.length ? <>
            <DataTableFrame tabIndex={0} role="region" aria-label="Part charge history" className={styles.tableFrame}>
              <table className={styles.table}><caption className={styles.srOnly}>Northwest part charge history</caption>
                <thead><tr>{["Date", "Work order", "Bus", "Entry", "Quantity", "Location", "Recorded by"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                <tbody>{filtered.slice(0, visible).map(row => <tr key={row.key}>
                  <td>{date(row.date)}</td><td><strong>{row.workOrder}</strong><small>Operation {row.operation ?? "not supplied"}</small></td>
                  <td>{row.bus ?? "Not supplied"}</td><td><StatusBadge tone={row.type === "MATERIAL_RETURN" ? "warning" : "neutral"}>{row.type === "MATERIAL_RETURN" ? "Return" : "Charge"}</StatusBadge></td>
                  <td>{quantity(row.quantity)} <small>{row.unit ?? "Unit not supplied"}</small></td>
                  <td>{[row.subinventory, row.locator].filter(Boolean).join(" / ") || "Not supplied"}</td>
                  <td>{row.enteredBy ?? "Not supplied"}{row.note && <small>{row.note}</small>}</td>
                </tr>)}</tbody>
              </table>
            </DataTableFrame>
            {filtered.length > visible && <Button onPress={() => setVisible(n => n + 50)}>Show more entries ({filtered.length - visible} remaining)</Button>}
          </> : <EmptyState kind={history.status === "loading" ? "loading" : history.status === "error" ? "error" : "empty"}
            title={history.status === "loading" ? "Reading charges from Oracle" : history.status === "error" ? "History could not be completed" : "No matching charge entries"}
            description={history.status === "complete" ? "No material transactions were returned for this part and these filters in Northwest." : "Only completed reads can confirm that there are no matching entries."} />}
          <p className={styles.hint}>Actual material issues and returns, with quantities as reported by Oracle. A work order can have multiple entries. Read {time(history.fetchedAt)}.</p>
        </Panel>
      </> : <EmptyState icon={<PackageSearch />} title="Choose a part to see its history" description="Stock and work order charges will appear together here." />}
    </>}
  </AppPage>;
}

function PartStock({ index, part }: { index: PartsIndex; part: Part }) {
  const balances = partBalances(index, part), assigned = partLocations(index, part);
  const total = index.progress.balances.status === "complete" ? balanceTotal(balances) : null;
  const rows = [...balances.map(row => ({ key: row.key, location: row.locator, room: row.subinventory, value: quantity(row.quantity), unit: row.unit || row.unitCode || "Unit not supplied", type: "Stock balance" })),
    ...assigned.filter(row => !balances.some(b => b.subinventory === row.subinventory && (b.locator === row.locator || row.locator === null)))
      .map(row => ({ key: row.key, location: row.locator, room: row.subinventory, value: "Unknown", unit: "No balance returned", type: "Assigned location" }))];
  return <Panel title={`${part.number} · ${part.description || "Part details"}`} description={`Catalog unit: ${part.unit || part.unitCode || "not supplied"} · Status: ${part.status || "not supplied"}`}
    actions={total ? <StatusBadge>{quantity(total.quantity)} {total.unit} on hand</StatusBadge> : undefined}>
    {rows.length ? <DataTableFrame tabIndex={0} role="region" aria-label="Northwest stock and locations">
      <table className={styles.table}><caption className={styles.srOnly}>Northwest stock and locations</caption>
        <thead><tr><th scope="col">Stockroom</th><th scope="col">Locator</th><th scope="col">On hand</th><th scope="col">Record</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}><td>{row.room ?? "Not supplied"}</td><td>{row.location ?? "Not supplied"}</td><td>{row.value}<small>{row.unit}</small></td><td>{row.type}</td></tr>)}</tbody>
      </table>
    </DataTableFrame> : <EmptyState title="No stock or location rows loaded for this part" description="Missing rows do not establish a zero balance. Check the index status above." />}
    <p className={styles.hint}>{index.stockSource === "buyers-report" ? "Source: Northwest Buyers Inventory report. Its on-hand quantity has no unit in the returned report, so no converted total is shown." : "Source: Oracle on-hand balances. Assigned locations alone do not establish available stock."} Last stock read {time(index.progress.balances.fetchedAt)}.</p>
  </Panel>;
}

export default function FusionPartsPage() {
  const [state, setState] = useState<PartsSnapshot>(INITIAL_PARTS_STATE);
  const client = useRef<PartsClient | null>(null);
  const router = useRouter();
  useEffect(() => {
    const reader = new PartsClient(window.fetch.bind(window), browserPartsCache, setState); client.current = reader;
    void reader.connect();
    const focus = () => { void reader.checkConnection(); };
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener("focus", focus); reader.dispose(); client.current = null; };
  }, []);
  return <FusionPartsView state={state} onRefresh={() => void client.current?.connect(true)}
    onSelect={id => void client.current?.selectPart(id)} onConnect={() => router.push("/fusion")} />;
}
