"use client";

import { useEffect, useRef, useState } from "react";
import { Form } from "react-aria-components";
import { Bookmark, Cable, Copy, ExternalLink, PackageSearch, RefreshCw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppPage, DataTableFrame, EmptyState, PageHeader, Panel, Toolbar, ToolbarGroup } from "../ui/Page";
import { Button } from "../ui/Button";
import { TextAreaField, TextField } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { createFusionBookmark } from "../lib/fusion/bookmark";
import { FusionClient, INITIAL_FUSION_STATE, type FusionSnapshot } from "../lib/fusion/client";
import { FUSION_HOME, FUSION_PAGE_SIZE, FUSION_RESOURCES, isFusionResource, type FusionResource } from "../lib/fusion/config";
import styles from "./FusionConnectionPage.module.css";

const STATUS: Record<FusionSnapshot["status"], { text: string; tone: StatusTone }> = {
  idle: { text: "Not connected", tone: "neutral" },
  connecting: { text: "Connecting…", tone: "info" },
  connected: { text: "Access saved", tone: "success" },
  "sign-in-required": { text: "Sign in to Fusion", tone: "warning" },
  disconnected: { text: "Disconnected", tone: "neutral" },
};
const OPTIONS = Object.entries(FUSION_RESOURCES).map(([id, resource]) => ({ id, label: resource.label }));

export interface FusionConnectionViewProps {
  state: FusionSnapshot;
  bookmark: string;
  resource: FusionResource;
  search: string;
  onResource: (resource: FusionResource) => void;
  onSearch: (search: string) => void;
  onRead: (offset: number) => void;
  onDisconnect: () => void;
  onParts: () => void;
}

export function FusionConnectionView({ state, bookmark, resource, search,
  onResource, onSearch, onRead, onDisconnect, onParts }: FusionConnectionViewProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const connected = state.status === "connected";
  const showSetup = setupOpen || state.status === "idle" || state.status === "disconnected" || state.status === "sign-in-required";
  const definition = FUSION_RESOURCES[resource];
  const status = STATUS[state.status];
  const result = state.result;

  async function copyBookmark() {
    try {
      await navigator.clipboard.writeText(bookmark);
      setCopyMessage("Copied. Paste this into the address of your Connect Lotsheet favorite.");
    } catch {
      setAddressOpen(true);
      setCopyMessage("Select and copy the favorite address below.");
    }
  }

  return (
    <AppPage className={styles.page}>
      <PageHeader title="Oracle Fusion" eyebrow="Connection"
        description="Connect once, then use Lotsheet until your Oracle access expires."
        actions={<>
          <Button onPress={onParts}><PackageSearch aria-hidden="true" /> Northwest parts</Button>
          <Button onPress={() => window.open(FUSION_HOME, "_blank", "noopener,noreferrer")}>
            <ExternalLink aria-hidden="true" /> Open Fusion
          </Button>
          <Button onPress={onDisconnect} isDisabled={!connected && state.status !== "sign-in-required"}>
            <Unplug aria-hidden="true" /> Disconnect
          </Button>
        </>} />

      <div className={styles.connection}>
        <div className={styles.status} role="status" aria-live="polite">
          <StatusBadge tone={status.tone} icon={<Cable />}>{status.text}</StatusBadge>
          <StatusBadge>Read-only</StatusBadge>
          {result && <span>Last read {new Date(result.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
        </div>
        <p className={styles.hint}>{connected && state.expiresAt
          ? <>You can close Fusion. Your saved access expires {new Date(state.expiresAt).toLocaleString()}.</>
          : state.status === "connecting" ? "Saving and checking your Oracle access. Keep Fusion open until this finishes."
          : "Sign into Fusion and click Connect Lotsheet. Once access is saved, you can close Fusion."}</p>
        {!showSetup && <Button size="sm" variant="quiet" onPress={() => setSetupOpen(true)} aria-expanded={false} aria-controls="fusion-favorite-setup">
          <Bookmark aria-hidden="true" /> Favorite setup
        </Button>}
      </div>

      {showSetup && <Panel title="Save your connection favorite once" id="fusion-favorite-setup"
        description="Use your existing Fusion bookmark check favorite, or create a new favorite."
        actions={setupOpen && connected ? <Button size="sm" variant="quiet" onPress={() => setSetupOpen(false)}>Hide setup</Button> : undefined}>
        <ol className={styles.steps}>
          <li>Name the favorite <strong>Connect Lotsheet</strong>.</li>
          <li>Copy the address below and paste it into the favorite’s address field.</li>
          <li>Open your signed-in Fusion tab and click the favorite. Wait for <strong>Access saved</strong>, then close Fusion and use Lotsheet.</li>
        </ol>
        <ToolbarGroup>
          <Button variant="primary" onPress={copyBookmark} isDisabled={!bookmark}>
            <Copy aria-hidden="true" /> Copy favorite address
          </Button>
          <Button variant="quiet" onPress={() => setAddressOpen(value => !value)} aria-expanded={addressOpen} aria-controls="fusion-favorite-address">
            {addressOpen ? "Hide address" : "Show address"}
          </Button>
        </ToolbarGroup>
        {copyMessage && <p className={styles.hint} role="status">{copyMessage}</p>}
        {addressOpen && <div id="fusion-favorite-address" className={styles.address}>
          <TextAreaField label="Favorite address" value={bookmark} isReadOnly
            description="Copy the entire address, including javascript: at the beginning." />
        </div>}
      </Panel>}

      <Panel title="Read from Fusion" description="These results stay in this tab. Your Oracle account determines which records are available.">
        <Form className={styles.form} onSubmit={event => { event.preventDefault(); onRead(0); }}>
          <SelectField label="Record type" selectedKey={resource} options={OPTIONS}
            onSelectionChange={key => { if (isFusionResource(key)) onResource(key); }} isDisabled={state.reading} />
          <TextField label={definition.singular + " (optional)"} value={search} onChange={onSearch}
            placeholder={resource === "workOrders" ? "For example, NWD-1683" : "For example, 6396"}
            description="Exact number, or leave blank to browse." maxLength={64} isReadOnly={state.reading} />
          <Button type="submit" variant="primary" isDisabled={!connected || state.reading}>
            <RefreshCw aria-hidden="true" /> {state.reading ? "Reading…" : "Read records"}
          </Button>
        </Form>
        {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
        {state.reading ? <EmptyState kind="loading" title="Reading from Fusion" description="Using your current Oracle access." /> :
          result ? <>
            <Toolbar className={styles.resultToolbar}>
              <span>{result.items.length ? `${result.offset + 1}–${result.offset + result.items.length}` : "0"} {definition.label.toLowerCase()}</span>
              <ToolbarGroup>
                <Button size="sm" onPress={() => onRead(Math.max(0, result.offset - FUSION_PAGE_SIZE))} isDisabled={result.offset === 0}>Previous</Button>
                <Button size="sm" onPress={() => onRead(result.offset + FUSION_PAGE_SIZE)} isDisabled={!result.hasMore || result.offset >= 10000}>Next</Button>
              </ToolbarGroup>
            </Toolbar>
            {result.items.length ? <DataTableFrame className={styles.results} tabIndex={0} role="region" aria-label={definition.label + " results"}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>{definition.label} from Oracle Fusion</caption>
                <thead><tr>{definition.columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>{result.items.map((row, index) => <tr key={result.offset + index}>
                  {definition.columns.map(column => <td key={column.key}>{formatCell(row[column.key], "date" in column)}</td>)}
                </tr>)}</tbody>
              </table>
            </DataTableFrame> : <EmptyState title="No matching records" description="Try another number, or leave it blank to browse records you can access." />}
            <p className={styles.hint}>Saved access works across Lotsheet pages and refreshes in this browser. When it expires, sign into Fusion and click your favorite again.</p>
          </> : !state.error && <EmptyState icon={<Cable />} title={connected ? "Ready to read" : "Connect from your Fusion tab"}
            description={connected ? "Choose a record type, then read records." : "Use your Connect Lotsheet favorite in Fusion to start."} />}
      </Panel>
    </AppPage>
  );
}

function formatCell(value: string | number | null | undefined, date: boolean) {
  if (value == null || value === "") return "—";
  if (date && typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toLocaleString();
  }
  return String(value);
}

export default function FusionConnectionPage() {
  const router = useRouter();
  const [state, setState] = useState<FusionSnapshot>(INITIAL_FUSION_STATE);
  const [bookmark, setBookmark] = useState("");
  const [resource, setResource] = useState<FusionResource>("workOrders");
  const [search, setSearch] = useState("");
  const client = useRef<FusionClient | null>(null);
  useEffect(() => {
    setBookmark(createFusionBookmark(window.location.origin));
    const connection = new FusionClient(window, setState);
    client.current = connection;
    connection.start();
    return () => { connection.dispose(); client.current = null; };
  }, []);
  return <FusionConnectionView state={state} bookmark={bookmark} resource={resource} search={search}
    onResource={value => { setResource(value); setSearch(""); client.current?.clearResults(); }}
    onSearch={value => { setSearch(value); client.current?.clearResults(); }}
    onRead={offset => client.current?.read(resource, search, offset)}
    onDisconnect={() => client.current?.disconnect()} onParts={() => router.push("/fusion/parts")} />;
}
